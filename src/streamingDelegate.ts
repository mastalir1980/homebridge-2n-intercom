import {
  CameraController,
  CameraControllerOptions,
  CameraStreamingDelegate,
  HAP,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  SnapshotRequest,
  SnapshotRequestCallback,
  SRTPCryptoSuites,
  StreamingRequest,
  StreamRequestCallback,
  StreamRequestTypes,
  Logger,
} from 'homebridge';
import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
const ffmpegPath = require('ffmpeg-for-homebridge');

type SessionInfo = {
  address: string; // address of the HAP controller

  videoPort: number;
  videoCryptoSuite: SRTPCryptoSuites; // should be saved if multiple suites are supported
  videoSRTP: Buffer; // key and salt concatenated
  videoSSRC: number; // rtp synchronisation source

  audioPort: number;
  audioCryptoSuite: SRTPCryptoSuites;
  audioSRTP: Buffer;
  audioSSRC: number;
  
  // Video configuration
  videoWidth: number;
  videoHeight: number;
  videoBitrate: number;
  videoFPS: number;
  videoCodec: string;
  
  // Retry tracking
  retryCount: number;
  lastError?: string;
  startTime: number;
};

export class TwoNStreamingDelegate implements CameraStreamingDelegate {
  private readonly hap: HAP;
  private readonly log: Logger;
  private readonly snapshotUrl: string;
  private readonly streamUrl: string;
  private readonly user: string;
  private readonly pass: string;
  
  // Retry configuration
  private readonly maxRetries = 3;
  private readonly retryDelay = 2000; // 2 seconds
  private readonly connectionTimeout = 15000; // 15 seconds
  private readonly debugMode = false; // Add debug mode

  controller?: CameraController;

  // keep track of sessions
  pendingSessions: Map<string, SessionInfo> = new Map();
  ongoingSessions: Map<string, ChildProcess> = new Map();

  constructor(hap: HAP, log: Logger, snapshotUrl: string, streamUrl: string, user: string, pass: string, debugMode: boolean = false) {
    this.hap = hap;
    this.log = log;
    this.snapshotUrl = snapshotUrl;
    this.streamUrl = streamUrl;
    this.user = user;
    this.pass = pass;
    
    // Set debug mode (override the readonly default)
    (this as any).debugMode = debugMode;
    
    if (this.debugMode) {
      this.log.info('🎬 StreamingDelegate initialized in debug mode');
      this.log.info(`📡 Stream URL: ${this.streamUrl}`);
    }
  }

  private createCameraControllerOptions(): CameraControllerOptions {
    return {
      cameraStreamCount: 2, // HomeKit requires at least 2 streams, but 1 is also just fine
      delegate: this,
      streamingOptions: {
        supportedCryptoSuites: [this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          resolutions: [
            [320, 180, 30],
            [320, 240, 15], // Apple Watch requires this configuration
            [320, 240, 30],
            [480, 270, 30],
            [480, 360, 30],
            [640, 360, 30],
            [640, 480, 30],
            [1280, 720, 30],
            [1280, 960, 30],
            [1920, 1080, 30],
            [1600, 1200, 30],
          ],
          codec: {
            profiles: [this.hap.H264Profile.BASELINE, this.hap.H264Profile.MAIN, this.hap.H264Profile.HIGH],
            levels: [this.hap.H264Level.LEVEL3_1, this.hap.H264Level.LEVEL3_2, this.hap.H264Level.LEVEL4_0],
          },
        },
        audio: {
          twoWayAudio: false,
          codecs: [
            {
              type: this.hap.AudioStreamingCodecType.AAC_ELD,
              samplerate: this.hap.AudioStreamingSamplerate.KHZ_16,
            },
          ],
        },
      },
    };
  }

  public getController(): CameraController {
    if (!this.controller) {
      const options = this.createCameraControllerOptions();
      this.controller = new this.hap.CameraController(options);
    }
    return this.controller;
  }

  async handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void> {
    try {
      this.log.debug('Snapshot requested:', request.width, 'x', request.height);
      
      // Build snapshot URL with required parameters
      const snapshotUrl = new URL(this.snapshotUrl);
      snapshotUrl.searchParams.set('width', request.width.toString());
      snapshotUrl.searchParams.set('height', request.height.toString());
      
      const response = await axios.get(snapshotUrl.toString(), {
        auth: {
          username: this.user,
          password: this.pass,
        },
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      callback(undefined, Buffer.from(response.data));
    } catch (error) {
      this.log.error('Error fetching snapshot:', error);
      callback(error as Error);
    }
  }

  async prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void> {
    const sessionId = request.sessionID;
    const targetAddress = request.targetAddress;

    // Generate unique SSRC values for each session
    const videoSSRC = this.generateSSRC();
    const audioSSRC = this.generateSSRC();

    const response: PrepareStreamResponse = {
      address: targetAddress,
      video: {
        port: request.video.port,
        ssrc: videoSSRC,
        srtp_key: request.video.srtp_key,
        srtp_salt: request.video.srtp_salt,
      },
      audio: {
        port: request.audio.port,
        ssrc: audioSSRC,
        srtp_key: request.audio.srtp_key,
        srtp_salt: request.audio.srtp_salt,
      },
    };

    const sessionInfo: SessionInfo = {
      address: targetAddress,
      videoPort: request.video.port,
      videoCryptoSuite: request.video.srtpCryptoSuite,
      videoSRTP: Buffer.concat([request.video.srtp_key, request.video.srtp_salt]),
      videoSSRC: videoSSRC,
      audioPort: request.audio.port,
      audioCryptoSuite: request.audio.srtpCryptoSuite,
      audioSRTP: Buffer.concat([request.audio.srtp_key, request.audio.srtp_salt]),
      audioSSRC: audioSSRC,
      videoWidth: 640, // VGA resolution
      videoHeight: 480,
      videoBitrate: 800, // Lower bitrate for VGA
      videoFPS: 15,
      videoCodec: 'libx264',
      
      // Retry tracking
      retryCount: 0,
      startTime: Date.now()
    };

    this.pendingSessions.set(sessionId, sessionInfo);
    callback(undefined, response);
  }

  /**
   * Generate a random SSRC value for RTP streams (32-bit unsigned integer)
   */
  private generateSSRC(): number {
    // Generate SSRC in valid range for FFmpeg RTP muxer (-2^31 to 2^31-1)
    return Math.floor(Math.random() * 0x7FFFFFFF);
  }

  async handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): Promise<void> {
    const sessionId = request.sessionID;

    try {
      switch (request.type) {
        case StreamRequestTypes.START:
          await this.startStream(sessionId, request, callback);
          break;
        case StreamRequestTypes.RECONFIGURE:
          this.log.debug('Reconfigure stream request received');
          // Update video properties based on request
          if (request.video) {
            const sessionInfo = this.pendingSessions.get(sessionId);
            if (sessionInfo) {
              if (request.video.width && request.video.height) {
                sessionInfo.videoWidth = request.video.width;
                sessionInfo.videoHeight = request.video.height;
            }
            if (request.video.max_bit_rate) {
              sessionInfo.videoBitrate = request.video.max_bit_rate;
            }
            if (request.video.fps) {
              sessionInfo.videoFPS = request.video.fps;
            }
          }
        }
        callback();
        break;
      case StreamRequestTypes.STOP:
        this.stopStream(sessionId, callback);
        break;
    }
    } catch (error) {
      this.log.error('❌ Stream request failed:', error);
      callback(error as Error);
    }
  }

  private async startStream(sessionId: string, request: StreamingRequest, callback: StreamRequestCallback): Promise<void> {
    const sessionInfo = this.pendingSessions.get(sessionId);
    if (!sessionInfo) {
      this.log.error('Error finding session information.');
      callback(new Error('Missing session info'));
      return;
    }

    // Update session info with stream request details if it's a StartStreamRequest
    if (request.type === StreamRequestTypes.START && 'video' in request) {
      sessionInfo.videoWidth = request.video.width || 640;
      sessionInfo.videoHeight = request.video.height || 480;
      sessionInfo.videoBitrate = request.video.max_bit_rate || 1000;
      sessionInfo.videoFPS = request.video.fps || 15;
    }

    // Reset retry tracking for new stream
    sessionInfo.retryCount = 0;
    sessionInfo.startTime = Date.now();

    this.log.debug(`Starting video stream (${sessionInfo.videoWidth}x${sessionInfo.videoHeight}, ${sessionInfo.videoBitrate} kbps, ${sessionInfo.videoFPS} fps)`);
    this.log.debug(`HomeKit requested: ${request.type === StreamRequestTypes.START && 'video' in request ? request.video.max_bit_rate : 'N/A'} kbps`);
    
    // Test RTSP connection before starting stream
    const connectionOk = await this.testRTSPConnection();
    if (!connectionOk) {
      this.log.error('❌ RTSP connection test failed');
      callback(new Error('RTSP connection test failed'));
      return;
    }

    if (this.debugMode) {
      this.log.info(`🎬 Starting video stream for session: ${sessionId}`);
    }

    await this.startActualStream(sessionId, sessionInfo, request, callback);
  }

  private async testRTSPConnection(): Promise<boolean> {
    try {
      if (this.debugMode) {
        this.log.info('🔍 Testing RTSP connection...');
      }

      const authenticatedUrl = `rtsp://${encodeURIComponent(this.user)}:${encodeURIComponent(this.pass)}@${this.streamUrl.replace('rtsp://', '')}`;
      
      let actualFfmpegPath = ffmpegPath;
      if (!existsSync(ffmpegPath)) {
        const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
        for (const path of systemPaths) {
          if (path === 'ffmpeg' || existsSync(path)) {
            actualFfmpegPath = path;
            break;
          }
        }
      }

      return new Promise<boolean>((resolve) => {
        const testArgs = [
          '-hide_banner',
          '-loglevel', 'error',
          '-rtsp_transport', 'tcp',
          '-timeout', '5000000', // 5 second timeout
          '-i', authenticatedUrl,
          '-t', '1',
          '-f', 'null',
          '-'
        ];

        const testProcess = spawn(actualFfmpegPath, testArgs);
        let testSuccessful = false;

        const testTimeout = setTimeout(() => {
          if (!testSuccessful) {
            testProcess.kill('SIGTERM');
            if (this.debugMode) {
              this.log.warn('⚠️ RTSP connection test timeout');
            }
            resolve(false);
          }
        }, 8000);

        testProcess.on('exit', (code) => {
          clearTimeout(testTimeout);
          testSuccessful = true;
          const success = code === 0;
          if (this.debugMode) {
            this.log.info(`🔍 RTSP test result: ${success ? 'SUCCESS' : 'FAILED'} (code: ${code})`);
          }
          resolve(success);
        });

        testProcess.on('error', () => {
          clearTimeout(testTimeout);
          testSuccessful = true;
          if (this.debugMode) {
            this.log.warn('⚠️ RTSP connection test failed');
          }
          resolve(false);
        });
      });
    } catch (error) {
      if (this.debugMode) {
        this.log.error('❌ RTSP test error:', error);
      }
      return false;
    }
  }

  private async handleStreamRetry(sessionId: string, sessionInfo: SessionInfo, request: StreamingRequest, callback: StreamRequestCallback, error: string): Promise<void> {
    sessionInfo.retryCount++;
    sessionInfo.lastError = error;

    if (sessionInfo.retryCount >= this.maxRetries) {
      this.log.error(`❌ Stream failed after ${this.maxRetries} attempts: ${error}`);
      this.pendingSessions.delete(sessionId);
      callback(new Error(`Stream failed: ${error}`));
      return;
    }

    this.log.warn(`⚠️ Stream attempt ${sessionInfo.retryCount} failed: ${error}. Retrying in ${this.retryDelay}ms...`);

    setTimeout(async () => {
      await this.startActualStream(sessionId, sessionInfo, request, callback);
    }, this.retryDelay);
  }

  private async startActualStream(sessionId: string, sessionInfo: SessionInfo, request: StreamingRequest, callback: StreamRequestCallback): Promise<void> {
    try {
      const authenticatedUrl = `rtsp://${encodeURIComponent(this.user)}:${encodeURIComponent(this.pass)}@${this.streamUrl.replace('rtsp://', '')}`;
      
      if (this.debugMode) {
        this.log.info(`🎬 Starting actual stream (attempt ${sessionInfo.retryCount + 1}/${this.maxRetries})`);
      }
      
      // Check if ffmpeg path exists and find alternative
      let actualFfmpegPath = ffmpegPath;
      if (!existsSync(ffmpegPath)) {
        this.log.warn('FFmpeg not found at:', ffmpegPath);
        const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
        for (const path of systemPaths) {
          if (path === 'ffmpeg' || existsSync(path)) {
            actualFfmpegPath = path;
            if (this.debugMode) {
              this.log.debug('Using alternative FFmpeg path:', actualFfmpegPath);
            }
            break;
          }
        }
      }
      
      const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', this.debugMode ? 'info' : 'error',
        '-rtsp_transport', 'tcp',
        '-timeout', '10000000', // 10 second timeout
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '2',
        '-i', authenticatedUrl,
        '-an', '-sn', '-dn', // No audio, subtitle, data streams
        '-codec:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-color_range', 'mpeg',
        '-preset', 'ultrafast', // Faster encoding
        '-tune', 'zerolatency', // Low latency
        '-r', sessionInfo.videoFPS.toString(),
        '-s', `${sessionInfo.videoWidth}x${sessionInfo.videoHeight}`,
        '-b:v', `${sessionInfo.videoBitrate}k`,
        '-bufsize', `${sessionInfo.videoBitrate * 2}k`,
        '-maxrate', `${sessionInfo.videoBitrate}k`,
        '-payload_type', '99',
        '-ssrc', sessionInfo.videoSSRC.toString(),
        '-f', 'rtp',
        '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params', sessionInfo.videoSRTP.toString('base64'),
        `srtp://${sessionInfo.address}:${sessionInfo.videoPort}?rtcpport=${sessionInfo.videoPort}&localrtcpport=${sessionInfo.videoPort}&pkt_size=1316`,
      ];

      // Log command but hide password
      const safeArgs = ffmpegArgs.map(arg => 
        arg.includes(this.pass) ? arg.replace(this.pass, '***') : arg
      );
      
      if (this.debugMode) {
        this.log.info('🔧 FFmpeg command:', actualFfmpegPath, safeArgs.join(' '));
        this.log.info(`📡 Streaming to: ${sessionInfo.address}:${sessionInfo.videoPort}`);
      }

      // Start ffmpeg process
      const ffmpegProcess = spawn(actualFfmpegPath, ffmpegArgs);
      
      // Enhanced error handling
      ffmpegProcess.on('error', (error) => {
        this.log.error('❌ FFmpeg process error:', error);
        this.ongoingSessions.delete(sessionId);
        this.handleStreamRetry(sessionId, sessionInfo, request, callback, `FFmpeg error: ${error.message}`);
      });
      
      // Track if stream started successfully
      let streamStarted = false;
      const startTimeout = setTimeout(() => {
        if (!streamStarted) {
          this.log.warn('⚠️ Stream startup timeout');
          ffmpegProcess.kill('SIGTERM');
          this.handleStreamRetry(sessionId, sessionInfo, request, callback, 'Stream startup timeout');
        }
      }, this.connectionTimeout);
      
      ffmpegProcess.on('exit', (code, signal) => {
        clearTimeout(startTimeout);
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          this.log.debug(`FFmpeg process terminated (${signal})`);
        } else if (code && code !== 0 && code !== 255) {
          this.log.error(`❌ FFmpeg process exited with code ${code}, signal ${signal}`);
          if (!streamStarted) {
            this.handleStreamRetry(sessionId, sessionInfo, request, callback, `FFmpeg exit code ${code}`);
            return;
          }
        } else {
          this.log.debug(`FFmpeg process exited normally`);
        }
        this.ongoingSessions.delete(sessionId);
      });
      
      // Enhanced stderr monitoring
      let errorCount = 0;
      ffmpegProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        
        // Check for successful stream start indicators
        if (message.includes('Opening') || message.includes('Stream #') || message.includes('fps=')) {
          if (!streamStarted) {
            streamStarted = true;
            clearTimeout(startTimeout);
            this.log.info('✅ Video stream started successfully');
            
            this.ongoingSessions.set(sessionId, ffmpegProcess);
            this.pendingSessions.delete(sessionId);
            callback();
          }
        }
        
        // Log errors and important messages
        if (this.debugMode || message.toLowerCase().includes('error') || errorCount < 3) {
          this.log.debug('FFmpeg:', message);
          errorCount++;
        }
        
        // Check for critical errors
        if (message.toLowerCase().includes('connection refused') || 
            message.toLowerCase().includes('network unreachable') ||
            message.toLowerCase().includes('authentication failed')) {
          if (!streamStarted) {
            ffmpegProcess.kill('SIGTERM');
            this.handleStreamRetry(sessionId, sessionInfo, request, callback, `RTSP error: ${message}`);
          }
        }
      });

      // Also monitor stdout for additional info
      if (this.debugMode) {
        ffmpegProcess.stdout?.on('data', (data) => {
          this.log.debug('FFmpeg stdout:', data.toString().trim());
        });
      }
      
      // Fallback success callback if no stderr data indicates success
      setTimeout(() => {
        if (!streamStarted) {
          streamStarted = true;
          clearTimeout(startTimeout);
          this.log.info('✅ Video stream assumed started (no errors detected)');
          
          this.ongoingSessions.set(sessionId, ffmpegProcess);
          this.pendingSessions.delete(sessionId);
          callback();
        }
      }, 3000); // 3 second fallback

    } catch (error) {
      this.log.error('❌ Error starting actual stream:', error);
      this.handleStreamRetry(sessionId, sessionInfo, request, callback, (error as Error).message);
    }
  }

  private stopStream(sessionId: string, callback: StreamRequestCallback): void {
    this.log.info('Stopping video stream');
    
    const ffmpegProcess = this.ongoingSessions.get(sessionId);
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGTERM');
      this.ongoingSessions.delete(sessionId);
    }
    
    this.pendingSessions.delete(sessionId);
    callback();
  }
}
