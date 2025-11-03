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
};

export class TwoNStreamingDelegate implements CameraStreamingDelegate {
  private readonly hap: HAP;
  private readonly log: Logger;
  private readonly snapshotUrl: string;
  private readonly streamUrl: string;
  private readonly user: string;
  private readonly pass: string;

  controller?: CameraController;

  // keep track of sessions
  pendingSessions: Map<string, SessionInfo> = new Map();
  ongoingSessions: Map<string, ChildProcess> = new Map();

  constructor(hap: HAP, log: Logger, snapshotUrl: string, streamUrl: string, user: string, pass: string) {
    this.hap = hap;
    this.log = log;
    this.snapshotUrl = snapshotUrl;
    this.streamUrl = streamUrl;
    this.user = user;
    this.pass = pass;
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

  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
    const sessionId = request.sessionID;

    switch (request.type) {
      case StreamRequestTypes.START:
        this.startStream(sessionId, request, callback);
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
  }

  private startStream(sessionId: string, request: StreamingRequest, callback: StreamRequestCallback): void {
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

    this.log.debug(`Starting video stream (${sessionInfo.videoWidth}x${sessionInfo.videoHeight}, ${sessionInfo.videoBitrate} kbps, ${sessionInfo.videoFPS} fps)`);
    this.log.debug(`HomeKit requested: ${request.type === StreamRequestTypes.START && 'video' in request ? request.video.max_bit_rate : 'N/A'} kbps`);
    
    try {
      // Build ffmpeg command with proper RTSP authentication
      const authenticatedUrl = `rtsp://${encodeURIComponent(this.user)}:${encodeURIComponent(this.pass)}@${this.streamUrl.replace('rtsp://', '')}`;
      
      // Check if ffmpeg path exists and find alternative
      this.log.debug('FFmpeg path from ffmpeg-for-homebridge:', ffmpegPath);
      
      let actualFfmpegPath = ffmpegPath;
      if (!existsSync(ffmpegPath)) {
        this.log.warn('FFmpeg not found at:', ffmpegPath);
        // Try common system paths
        const systemPaths = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'];
        for (const path of systemPaths) {
          if (path === 'ffmpeg' || existsSync(path)) {
            actualFfmpegPath = path;
            this.log.debug('Using alternative FFmpeg path:', actualFfmpegPath);
            break;
          }
        }
      }
      
      const ffmpegArgs = [
        '-hide_banner',
        '-loglevel', 'error',
        '-rtsp_transport', 'tcp',
        '-i', authenticatedUrl,
        '-an', '-sn', '-dn', // No audio, subtitle, data streams
        '-codec:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-color_range', 'mpeg',
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
      this.log.debug('FFmpeg command:', actualFfmpegPath, safeArgs.join(' '));
      this.log.debug(`Streaming to HomeKit device: ${sessionInfo.address}:${sessionInfo.videoPort}`);

      // Start ffmpeg process
      const ffmpegProcess = spawn(actualFfmpegPath, ffmpegArgs);
      
      ffmpegProcess.on('error', (error) => {
        this.log.error('FFmpeg process error:', error);
        this.ongoingSessions.delete(sessionId);
      });
      
      ffmpegProcess.on('exit', (code, signal) => {
        if (signal === 'SIGTERM' || signal === 'SIGKILL') {
          this.log.debug(`FFmpeg process terminated (${signal})`);
        } else if (code && code !== 0 && code !== 255) {
          this.log.error(`FFmpeg process exited with code ${code}, signal ${signal}`);
        } else {
          this.log.debug(`FFmpeg process exited normally`);
        }
        this.ongoingSessions.delete(sessionId);
      });
      
      // Only log errors and first few messages to reduce noise
      let logCount = 0;
      ffmpegProcess.stderr?.on('data', (data) => {
        const message = data.toString().trim();
        if (logCount < 3 || message.toLowerCase().includes('error')) {
          this.log.debug('FFmpeg:', message);
          logCount++;
        }
      });

      ffmpegProcess.stdout?.on('data', (data) => {
        this.log.debug('FFmpeg output:', data.toString().trim());
      });
      
      this.ongoingSessions.set(sessionId, ffmpegProcess);
      this.pendingSessions.delete(sessionId);

      callback();
    } catch (error) {
      this.log.error('Error starting stream:', error);
      callback(error as Error);
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
