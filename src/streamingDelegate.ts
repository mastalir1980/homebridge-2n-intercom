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
import https from 'https';
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
  
  // Optimized retry configuration for faster stream startup
  private readonly maxRetries = 2; // Reduced from 3 for faster failure recovery
  private readonly retryDelay = 1000; // Reduced from 2000ms to 1s
  private readonly connectionTimeout = 8000; // Reduced from 15s to 8s
  private readonly rtspTestTimeout = 3000; // New: quick RTSP test (reduced from 8s)
  private readonly fallbackTimeout = 2000; // New: faster fallback (reduced from 3s)
  private readonly debugMode: boolean; // Debug mode from config
  private readonly videoQuality: 'vga' | 'hd'; // Video quality setting
  private readonly verifySSL: boolean; // SSL certificate verification

  controller?: CameraController;

  // keep track of sessions
  pendingSessions: Map<string, SessionInfo> = new Map();
  ongoingSessions: Map<string, ChildProcess> = new Map();

  constructor(hap: HAP, log: Logger, snapshotUrl: string, streamUrl: string, user: string, pass: string, debugMode: boolean = false, videoQuality: 'vga' | 'hd' = 'vga', verifySSL: boolean = false) {
    this.hap = hap;
    this.log = log;
    this.snapshotUrl = snapshotUrl;
    this.streamUrl = streamUrl;
    this.user = user;
    this.pass = pass;
    this.debugMode = debugMode; // Initialize debug mode
    this.videoQuality = videoQuality; // Initialize video quality
    this.verifySSL = verifySSL; // Initialize SSL verification
    
    // TwoNStreamingDelegate initialized
  }

  /**
   * Create axios configuration with SSL support for self-signed certificates
   */
  private createAxiosConfig(url: string, verifySSL: boolean = false): any {
    const config: any = {
      responseType: 'arraybuffer',
      timeout: 5000,
    };

    // For HTTPS URLs, configure SSL certificate verification based on user preference
    if (url.startsWith('https://')) {
      config.httpsAgent = new https.Agent({
        rejectUnauthorized: verifySSL, // Default false for 2N intercoms with self-signed certs
      });
    }

    return config;
  }

  private createCameraControllerOptions(): CameraControllerOptions {
    return {
      cameraStreamCount: 2, // HomeKit requires at least 2 streams, but 1 is also just fine
      delegate: this,
      streamingOptions: {
        supportedCryptoSuites: [this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          resolutions: [
            [640, 480, 15], // PREFERRED for the bandwidth/performance balance
            [320, 240, 15], // Apple Watch requires this configuration
            [640, 480, 30], // Alternative VGA
            [320, 180, 30],
            [320, 240, 30],
            [480, 270, 30],
            [480, 360, 30],
            [640, 360, 30],
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
      // Build snapshot URL with required parameters
      const snapshotUrl = new URL(this.snapshotUrl);
      snapshotUrl.searchParams.set('width', request.width.toString());
      snapshotUrl.searchParams.set('height', request.height.toString());

      const snapshotUrlString = snapshotUrl.toString();
      const axiosConfig = this.createAxiosConfig(snapshotUrlString, this.verifySSL);
      axiosConfig.auth = {
        username: this.user,
        password: this.pass,
      };
      axiosConfig.timeout = 10000;

      const response = await axios.get(snapshotUrlString, axiosConfig);

      callback(undefined, Buffer.from(response.data));
    } catch (error) {
      this.log.error('❌ SNAPSHOT ERROR:', error);
      callback(error as Error);
    }
  }

  async prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void> {
    const sessionId = request.sessionID;
    const targetAddress = request.targetAddress;



    // Generate unique SSRC values for each session
    const videoSSRC = this.generateSSRC();
    const audioSSRC = this.generateSSRC();
    
    this.log.info(`🔧 Generated SSRC: video=${videoSSRC}, audio=${audioSSRC}`);

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
      videoWidth: this.videoQuality === 'vga' ? 640 : 1280,
      videoHeight: this.videoQuality === 'vga' ? 480 : 720,  
      videoBitrate: this.videoQuality === 'vga' ? 500 : 1000, 
      videoFPS: this.videoQuality === 'vga' ? 15 : 30,
      videoCodec: 'libx264',
      
      // Retry tracking
      retryCount: 0,
      startTime: Date.now()
    };

    this.pendingSessions.set(sessionId, sessionInfo);
    this.log.info(`✅ STREAM PREPARED: SessionID=${sessionId}, VideoPort=${request.video.port}, VideoSize=${sessionInfo.videoWidth}x${sessionInfo.videoHeight}`);
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
          this.log.info(`▶️ STARTING STREAM: SessionID=${sessionId}`);
          await this.startStream(sessionId, request, callback);
          break;
        case StreamRequestTypes.RECONFIGURE:
          this.log.info(`🔧 RECONFIGURING STREAM: SessionID=${sessionId}`);
          // Update video properties based on request
          if (request.video) {
            const sessionInfo = this.pendingSessions.get(sessionId);
            if (sessionInfo) {
              if (request.video.width && request.video.height) {
                this.log.info(`🔧 Updating resolution: ${sessionInfo.videoWidth}x${sessionInfo.videoHeight} → ${request.video.width}x${request.video.height}`);
                sessionInfo.videoWidth = request.video.width;
                sessionInfo.videoHeight = request.video.height;
            }
            if (request.video.max_bit_rate) {
              this.log.info(`🔧 Updating bitrate: ${sessionInfo.videoBitrate} → ${request.video.max_bit_rate}`);
              sessionInfo.videoBitrate = request.video.max_bit_rate;
            }
            if (request.video.fps) {
              this.log.info(`🔧 Updating FPS: ${sessionInfo.videoFPS} → ${request.video.fps}`);
              sessionInfo.videoFPS = request.video.fps;
            }
          }
        }
        this.log.info(`✅ STREAM RECONFIGURED: SessionID=${sessionId}`);
        callback();
        break;
      case StreamRequestTypes.STOP:
        this.log.info(`⏹️ STOPPING STREAM: SessionID=${sessionId}`);
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
      this.log.error('❌ ERROR: Session information not found');
      callback(new Error('Missing session info'));
      return;
    }

    this.log.info(`📋 Session found: ${sessionInfo.address}:${sessionInfo.videoPort}`);

    // Use native VGA@15fps parameters for optimal performance (no transcoding)
    if (request.type === StreamRequestTypes.START && 'video' in request) {
      // Keep native VGA@15fps parameters - don't override with HomeKit request
      // This eliminates transcoding and reduces CPU/bandwidth usage
    }

    // Reset retry tracking for new stream
    sessionInfo.retryCount = 0;
    sessionInfo.startTime = Date.now();

    this.log.info(`📺 Starting stream: ${sessionInfo.videoWidth}x${sessionInfo.videoHeight} @ ${sessionInfo.videoFPS}fps`);
    
    // Test RTSP connection before starting stream

    const connectionOk = await this.testRTSPConnection();
    if (!connectionOk) {
      this.log.error('❌ RTSP CONNECTION TEST FAILED');
      callback(new Error('RTSP connection test failed'));
      return;
    }

    this.log.info(`✅ RTSP CONNECTION TEST PASSED`);
    this.log.info(`🚀 Proceeding to start actual stream for session: ${sessionId}`);

    await this.startActualStream(sessionId, sessionInfo, request, callback);
  }

  private async testRTSPConnection(): Promise<boolean> {
    this.log.info('🔍 RTSP CONNECTION TEST STARTING...');
    
    try {
      const authenticatedUrl = `rtsp://${encodeURIComponent(this.user)}:${encodeURIComponent(this.pass)}@${this.streamUrl.replace('rtsp://', '')}`;
      const safeUrl = authenticatedUrl.replace(this.pass, '***');

      
      let actualFfmpegPath = ffmpegPath;
      this.log.info(`🔧 FFmpeg path: ${ffmpegPath}`);
      
      if (!existsSync(ffmpegPath)) {
        this.log.warn(`⚠️ FFmpeg not found at default path: ${ffmpegPath}`);
        const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
        for (const path of systemPaths) {
          this.log.info(`🔍 Trying alternative path: ${path}`);
          if (path === 'ffmpeg' || existsSync(path)) {
            actualFfmpegPath = path;
            this.log.info(`✅ Found FFmpeg at: ${actualFfmpegPath}`);
            break;
          }
        }
      } else {
        this.log.info(`✅ FFmpeg found at default path`);
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

        if (this.debugMode) {
          this.log.debug(`🚀 Starting FFmpeg test process with args: ${testArgs.map(arg => arg.includes(this.pass) ? '***' : arg).join(' ')}`);
        }
        const testProcess = spawn(actualFfmpegPath, testArgs);
        let testSuccessful = false;

        const testTimeout = setTimeout(() => {
          if (!testSuccessful) {
            this.log.warn(`⏰ RTSP connection test timeout (${this.rtspTestTimeout}ms - optimized for faster startup)`);
            testProcess.kill('SIGTERM');
            resolve(false);
          }
        }, this.rtspTestTimeout); // Optimized: 3 seconds instead of 8

        testProcess.on('exit', (code) => {
          clearTimeout(testTimeout);
          testSuccessful = true;
          const success = code === 0;
          this.log.info(`🔍 RTSP TEST RESULT: ${success ? '✅ SUCCESS' : '❌ FAILED'} (exit code: ${code})`);
          resolve(success);
        });

        testProcess.on('error', (error) => {
          clearTimeout(testTimeout);
          testSuccessful = true;
          this.log.error(`❌ RTSP test process error: ${error.message}`);
          resolve(false);
        });
        
        // Add stderr logging for test process
        testProcess.stderr?.on('data', (data) => {
          const message = data.toString().trim();
          if (message) {
            this.log.warn(`🔍 RTSP test stderr: ${message}`);
          }
        });
      });
    } catch (error) {
      this.log.error('❌ RTSP TEST EXCEPTION:', error);
      return false;
    }
  }

  private async handleStreamRetry(sessionId: string, sessionInfo: SessionInfo, request: StreamingRequest, callback: StreamRequestCallback, error: string): Promise<void> {
    sessionInfo.retryCount++;
    sessionInfo.lastError = error;

    this.log.warn(`🔄 RETRY HANDLER: SessionID=${sessionId}, Attempt=${sessionInfo.retryCount}/${this.maxRetries}`);
    this.log.warn(`🔄 Error that triggered retry: ${error}`);

    if (sessionInfo.retryCount >= this.maxRetries) {
      this.log.error(`❌ STREAM FAILED PERMANENTLY after ${this.maxRetries} attempts`);
      this.log.error(`❌ Final error: ${error}`);
      this.pendingSessions.delete(sessionId);
      callback(new Error(`Stream failed: ${error}`));
      return;
    }

    this.log.warn(`⏳ FAST RETRY in ${this.retryDelay}ms... (optimized delay, attempt ${sessionInfo.retryCount + 1}/${this.maxRetries})`);

    setTimeout(async () => {
      this.log.info(`🔄 STARTING RETRY ATTEMPT ${sessionInfo.retryCount + 1}/${this.maxRetries} (fast recovery mode)`);
      await this.startActualStream(sessionId, sessionInfo, request, callback);
    }, this.retryDelay);
  }

  private async startActualStream(sessionId: string, sessionInfo: SessionInfo, request: StreamingRequest, callback: StreamRequestCallback): Promise<void> {
    this.log.info(`🚀 START ACTUAL STREAM: SessionID=${sessionId}, Attempt=${sessionInfo.retryCount + 1}/${this.maxRetries}`);
    
    // Guard against multiple callback calls
    let callbackCalled = false;
    const safeCallback = (error?: Error) => {
      if (!callbackCalled) {
        callbackCalled = true;
        callback(error);
      }
    };
    
    try {
      const authenticatedUrl = `rtsp://${encodeURIComponent(this.user)}:${encodeURIComponent(this.pass)}@${this.streamUrl.replace('rtsp://', '')}`;
      const safeUrl = authenticatedUrl.replace(this.pass, '***');
      

      this.log.info(`🎯 Target: ${sessionInfo.address}:${sessionInfo.videoPort}`);
      this.log.info(`📐 Video config: ${sessionInfo.videoWidth}x${sessionInfo.videoHeight}, ${sessionInfo.videoBitrate}k, ${sessionInfo.videoFPS}fps`);
      
      // Check if ffmpeg path exists and find alternative
      if (this.debugMode) {
        this.log.debug(`🔧 Checking FFmpeg path: ${ffmpegPath}`);
      }
      let actualFfmpegPath = ffmpegPath;
      if (!existsSync(ffmpegPath)) {
        this.log.warn(`⚠️ FFmpeg not found at default path: ${ffmpegPath}`);
        const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
        for (const path of systemPaths) {
          this.log.info(`🔍 Trying alternative: ${path}`);
          if (path === 'ffmpeg' || existsSync(path)) {
            actualFfmpegPath = path;
            this.log.info(`✅ Using FFmpeg at: ${actualFfmpegPath}`);
            break;
          }
        }
      } else {
        this.log.info(`✅ FFmpeg found at default path`);
      }
      
      const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', this.debugMode ? 'info' : 'error',
        '-rtsp_transport', 'tcp',
        '-timeout', '10000000', // 10 second timeout
        '-i', authenticatedUrl,
        '-an', '-sn', '-dn', // No audio, subtitle, data streams
        '-codec:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-color_range', 'mpeg',
        '-preset', 'ultrafast', // Faster encoding
        '-tune', 'zerolatency', // Low latency
        '-profile:v', 'baseline', // Better HomeKit compatibility
        '-level:v', '3.1',        // Explicit level
        '-r', sessionInfo.videoFPS.toString(),
        '-s', `${sessionInfo.videoWidth}x${sessionInfo.videoHeight}`,
        '-b:v', `${sessionInfo.videoBitrate}k`,
        '-bufsize', `${sessionInfo.videoBitrate * 2}k`,
        '-maxrate', `${sessionInfo.videoBitrate}k`,
        '-g', (sessionInfo.videoFPS * 2).toString(), // GOP every 2 seconds
        '-keyint_min', sessionInfo.videoFPS.toString(), // Min GOP
        '-sc_threshold', '0',     // Disable scene cuts
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
      
      // Start ffmpeg process (log command only in debug mode)
      if (this.debugMode) {
        this.log.debug('🔧 FFmpeg command:');
        this.log.debug(`   Executable: ${actualFfmpegPath}`);
        this.log.debug(`   Args: ${safeArgs.join(' ')}`);
      }
      const ffmpegProcess = spawn(actualFfmpegPath, ffmpegArgs);
      
      // Enhanced error handling
      ffmpegProcess.on('error', (error) => {
        this.log.error(`❌ FFMPEG PROCESS ERROR: ${error.message}`);
        this.ongoingSessions.delete(sessionId);
        if (!callbackCalled) {
          this.handleStreamRetry(sessionId, sessionInfo, request, safeCallback, `FFmpeg error: ${error.message}`);
        }
      });
      
      // Track if stream started successfully
      let streamStarted = false;
      if (this.debugMode) {
        this.log.debug(`⏱️ Setting ${this.connectionTimeout}ms timeout for stream startup...`);
      }
      const startTimeout = setTimeout(() => {
        if (!streamStarted && !callbackCalled) {
          this.log.warn(`⏰ STREAM STARTUP TIMEOUT (${this.connectionTimeout}ms - optimized) - killing process`);
          ffmpegProcess.kill('SIGTERM');
          this.handleStreamRetry(sessionId, sessionInfo, request, safeCallback, 'Stream startup timeout');
        }
      }, this.connectionTimeout);
      
      ffmpegProcess.on('exit', (code, signal) => {
        clearTimeout(startTimeout);
        this.log.info(`🔚 FFmpeg process exited: code=${code}, signal=${signal}, streamStarted=${streamStarted}`);
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          this.log.debug(`FFmpeg process terminated (${signal})`);
        } else if (code && code !== 0 && code !== 255) {
          this.log.error(`❌ FFmpeg process exited with code ${code}, signal ${signal}`);
          if (!streamStarted && !callbackCalled) {
            this.handleStreamRetry(sessionId, sessionInfo, request, safeCallback, `FFmpeg exit code ${code}`);
            return;
          }
        } else {
          this.log.debug(`FFmpeg process exited normally`);
        }
        this.ongoingSessions.delete(sessionId);
      });
      
      // Monitor FFmpeg output
      let errorCount = 0;
      ffmpegProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        
        // Log only errors and critical messages
        if (message.includes('error') || message.includes('Error')) {
          this.log.warn(`📺 FFmpeg error: ${message}`);
        } else if (this.debugMode) {
          this.log.debug(`📺 FFmpeg: ${message}`);
        }
        
        // Optimized: Check for successful stream start indicators (faster detection)
        if (message.includes('Input #') || message.includes('Stream mapping') || 
            message.includes('Output #') || message.includes('Stream #') ||
            message.includes('encoder') || message.includes('muxer') ||
            message.includes('Opening') || message.includes('fps=')) {
          if (!streamStarted && !callbackCalled) {
            streamStarted = true;
            clearTimeout(startTimeout);
            this.log.info('✅ STREAM STARTED FAST! (early FFmpeg output detected)');
            
            this.ongoingSessions.set(sessionId, ffmpegProcess);
            this.pendingSessions.delete(sessionId);
            safeCallback();
          }
        }
        
        // Check for critical errors
        if (message.toLowerCase().includes('connection refused') || 
            message.toLowerCase().includes('network unreachable') ||
            message.toLowerCase().includes('authentication failed') ||
            message.toLowerCase().includes('rtsp') && message.toLowerCase().includes('error')) {
          this.log.error(`🚨 CRITICAL FFMPEG ERROR DETECTED: ${message}`);
          if (!streamStarted && !callbackCalled) {
            this.log.error('🚨 Killing FFmpeg process due to critical error');
            ffmpegProcess.kill('SIGTERM');
            this.handleStreamRetry(sessionId, sessionInfo, request, safeCallback, `RTSP error: ${message}`);
          }
        }
      });

      // Monitor stdout only in debug mode
      ffmpegProcess.stdout?.on('data', (data) => {
        if (this.debugMode) {
          this.log.debug(`📺 FFmpeg stdout: ${data.toString().trim()}`);
        }
      });
      
      // Optimized fallback success callback - faster response
      if (this.debugMode) {
        this.log.debug(`⏱️ Setting ${this.fallbackTimeout}ms fallback timeout...`);
      }
      setTimeout(() => {
        if (!streamStarted && !callbackCalled) {
          streamStarted = true;
          clearTimeout(startTimeout);
          this.log.info(`✅ STREAM ASSUMED STARTED (fast fallback - no errors detected after ${this.fallbackTimeout}ms)`);
          
          this.ongoingSessions.set(sessionId, ffmpegProcess);
          this.pendingSessions.delete(sessionId);
          safeCallback();
        }
      }, this.fallbackTimeout); // Optimized: 2 seconds instead of 3

    } catch (error) {
      this.log.error('❌ EXCEPTION in startActualStream:', error);
      if (!callbackCalled) {
        this.handleStreamRetry(sessionId, sessionInfo, request, safeCallback, (error as Error).message);
      }
    }
  }

  private stopStream(sessionId: string, callback: StreamRequestCallback): void {
    this.log.info(`🛑 STOP STREAM: SessionID=${sessionId}`);
    
    const ffmpegProcess = this.ongoingSessions.get(sessionId);
    if (ffmpegProcess) {
      this.log.info(`🔪 Killing FFmpeg process for session ${sessionId}`);
      ffmpegProcess.kill('SIGTERM');
      this.ongoingSessions.delete(sessionId);
      this.log.info(`✅ FFmpeg process terminated and removed from ongoing sessions`);
    } else {
      this.log.warn(`⚠️ No FFmpeg process found for session ${sessionId}`);
    }
    
    this.pendingSessions.delete(sessionId);
    this.log.info(`🧹 Session ${sessionId} cleaned up from pending sessions`);
    callback();
  }
}
