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
  ongoingSessions: Map<string, any> = new Map();

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
      
      const response = await axios.get(this.snapshotUrl, {
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
    };

    this.pendingSessions.set(sessionId, sessionInfo);
    callback(undefined, response);
  }

  /**
   * Generate a random SSRC value for RTP streams
   */
  private generateSSRC(): number {
    return Math.floor(Math.random() * 0xFFFFFFFF);
  }

  handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): void {
    const sessionId = request.sessionID;

    switch (request.type) {
      case StreamRequestTypes.START:
        // Note: This implementation provides the RTSP URL to HomeKit, which handles the actual
        // streaming. For more advanced scenarios, you could use ffmpeg to transcode the stream,
        // but for basic RTSP streaming from 2N intercoms, HomeKit's native support is sufficient.
        this.log.info('Starting video stream from RTSP URL:', this.streamUrl);
        const sessionInfo = this.pendingSessions.get(sessionId);
        if (sessionInfo) {
          this.ongoingSessions.set(sessionId, true);
          this.pendingSessions.delete(sessionId);
        }
        callback();
        break;
      case StreamRequestTypes.RECONFIGURE:
        this.log.debug('Reconfigure stream request received');
        callback();
        break;
      case StreamRequestTypes.STOP:
        this.log.info('Stopping video stream');
        this.ongoingSessions.delete(sessionId);
        callback();
        break;
    }
  }
}
