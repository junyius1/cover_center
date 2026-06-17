<template>
  <div class="audio-player">
    <div class="player-header">
      <h3>
        <el-icon><Monitor /></el-icon>
        Now Playing
      </h3>
    </div>

    <div class="player-body">
      <!-- Album Art / Visualizer -->
      <div class="art-container">
        <div class="album-art" :class="{ 'is-playing': isPlaying }">
          <div class="vinyl-disc">
            <div class="vinyl-grooves">
              <div class="groove"></div>
              <div class="groove"></div>
              <div class="groove"></div>
              <div class="groove"></div>
            </div>
            <div class="vinyl-label">
              <el-icon :size="24"><Headset /></el-icon>
            </div>
          </div>
        </div>
      </div>

      <!-- Track Info -->
      <div class="track-info">
        <h4 class="track-title" :title="currentTrack?.name || 'No track selected'">
          {{ currentTrack?.name || 'Select a track' }}
        </h4>
        <p class="track-status">
          <span v-if="isPlaying" class="status-playing">
            <el-icon class="spin"><Refresh /></el-icon> Playing
          </span>
          <span v-else-if="trackUrl" class="status-paused">Paused</span>
          <span v-else class="status-idle">Idle</span>
        </p>
      </div>

      <!-- Progress Bar -->
      <div class="progress-section">
        <div class="time-display">
          <span>{{ formatTime(currentTime) }}</span>
          <span>{{ formatTime(duration) }}</span>
        </div>
        <div class="progress-bar-wrapper" @click="seekTo">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }">
              <div class="progress-thumb"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="controls">
        <button class="ctrl-btn" :disabled="!trackUrl" @click="stopPlayback">
          <el-icon><VideoPause /></el-icon>
        </button>
        <button class="ctrl-btn play-btn" :disabled="!trackUrl" @click="togglePlay">
          <el-icon><VideoPlay v-if="!isPlaying" /><VideoPause v-else /></el-icon>
        </button>
        <button class="ctrl-btn" :disabled="!trackUrl" @click="skipToPrev">
          <el-icon><Back /></el-icon>
        </button>
        <button class="ctrl-btn" :disabled="!trackUrl" @click="skipToNext">
          <el-icon><Right /></el-icon>
        </button>
      </div>

      <!-- Volume -->
      <div class="volume-section">
        <el-icon class="volume-icon" @click="toggleMute">
          <Microphone v-if="volume > 0.5" />
          <Cellphone v-else-if="volume === 0" />
          <CloseBold v-else />
        </el-icon>
        <el-slider
          v-model="volume"
          :min="0"
          :max="100"
          :step="1"
          size="small"
          @input="onVolumeChange"
        />
        <span class="volume-value">{{ volume }}%</span>
      </div>

      <!-- Queue Preview -->
      <div class="queue-section" v-if="queue.length > 0">
        <h5>Queue ({{ queue.length }} tracks)</h5>
        <div class="queue-list">
          <div
            v-for="(track, index) in queue"
            :key="index"
            class="queue-item"
            :class="{ active: currentTrack?.url === track.url }"
            @click="playFromQueue(index)"
          >
            <el-icon class="queue-icon"><Headset /></el-icon>
            <span class="queue-name" :title="track.name">{{ track.name }}</span>
            <el-icon v-if="currentTrack?.url === track.url" class="playing-indicator" :class="{ spin: isPlaying }">
              <Refresh />
            </el-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden audio element -->
    <audio
      ref="audioEl"
      :src="trackUrl"
      @loadedmetadata="onLoadedMetadata"
      @ended="onEnded"
      @timeupdate="onTimeUpdate"
      @play="onPlay"
      @pause="onPause"
      @error="onAudioError"
      @waiting="onWaiting"
      @canplay="onCanPlay"
    ></audio>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  Monitor, Headset, Refresh,
  VideoPlay, VideoPause, Back, Right,
  Microphone, CloseBold, Cellphone
} from '@element-plus/icons-vue'

const props = defineProps({
  trackName: { type: String, default: '' },
  trackUrl: { type: String, default: '' },
})

const audioEl = ref(null)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(80)
const isMuted = ref(false)
const isPlaying = ref(false)
const queue = ref([])
const isBuffering = ref(false)

// Keep track of the current track index in the queue
const currentQueueIndex = ref(-1)

const progress = computed(() => {
  if (!duration.value || duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

const currentTrack = computed(() => {
  if (currentQueueIndex.value >= 0 && queue.value[currentQueueIndex.value]) {
    return queue.value[currentQueueIndex.value]
  }
  return null
})

// Watch for new track from parent
watch(() => props.trackUrl, (newUrl) => {
  if (newUrl && audioEl.value) {
    audioEl.value.src = newUrl
    audioEl.value.load()
    // Add to queue if not already there
    const trackInfo = { name: props.trackName, url: newUrl }
    const exists = queue.value.findIndex((t) => t.url === newUrl)
    if (exists === -1) {
      queue.value.push(trackInfo)
      currentQueueIndex.value = queue.value.length - 1
    } else {
      currentQueueIndex.value = exists
    }
    // Auto-play when track is set
    playAudio()
  }
}, { immediate: true })

function playAudio() {
  if (audioEl.value) {
    audioEl.value.play().catch((err) => {
      console.warn('Auto-play prevented:', err)
    })
  }
}

function togglePlay() {
  if (!audioEl.value || !props.trackUrl) return
  if (isPlaying.value) {
    audioEl.value.pause()
  } else {
    playAudio()
  }
}

function stopPlayback() {
  if (audioEl.value) {
    audioEl.value.pause()
    audioEl.value.currentTime = 0
  }
  isPlaying.value = false
}

function seekTo(event) {
  if (!audioEl.value || !duration.value) return
  const rect = event.currentTarget.getBoundingClientRect()
  const clickX = event.clientX - rect.left
  const width = rect.width
  const seekTime = (clickX / width) * duration.value
  audioEl.value.currentTime = seekTime
}

function skipToPrev() {
  if (currentQueueIndex.value > 0) {
    currentQueueIndex.value--
    const track = queue.value[currentQueueIndex.value]
    if (track) {
      audioEl.value.src = track.url
      audioEl.value.load()
      playAudio()
    }
  }
}

function skipToNext() {
  if (currentQueueIndex.value < queue.value.length - 1) {
    currentQueueIndex.value++
    const track = queue.value[currentQueueIndex.value]
    if (track) {
      audioEl.value.src = track.url
      audioEl.value.load()
      playAudio()
    }
  }
}

function playFromQueue(index) {
  const track = queue.value[index]
  if (track) {
    currentQueueIndex.value = index
    audioEl.value.src = track.url
    audioEl.value.load()
    playAudio()
  }
}

function onVolumeChange(val) {
  if (audioEl.value) {
    audioEl.value.volume = val / 100
  }
  if (val === 0) {
    isMuted.value = true
  } else {
    isMuted.value = false
  }
}

function toggleMute() {
  isMuted.value = !isMuted.value
  if (audioEl.value) {
    audioEl.value.muted = isMuted.value
  }
}

function onLoadedMetadata() {
  duration.value = audioEl.value?.duration || 0
}

function onTimeUpdate() {
  currentTime.value = audioEl.value?.currentTime || 0
}

function onPlay() {
  isPlaying.value = true
  isBuffering.value = false
}

function onPause() {
  isPlaying.value = false
}

function onEnded() {
  isPlaying.value = false
  // Auto-skip to next track
  if (currentQueueIndex.value < queue.value.length - 1) {
    skipToNext()
  }
}

function onAudioError() {
  ElMessage.error('Error loading audio file')
  isPlaying.value = false
}

function onWaiting() {
  isBuffering.value = true
}

function onCanPlay() {
  isBuffering.value = false
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<style scoped>
.audio-player {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #16213e 0%, #1a1a2e 100%);
  border-radius: 12px;
  overflow: hidden;
}

.player-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #1a1a3e, #0f3460);
  border-bottom: 1px solid #2a2a5a;
}

.player-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e0e0e0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-header h3 .el-icon {
  color: #e94560;
}

.player-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding: 20px;
  gap: 16px;
}

.player-body::-webkit-scrollbar {
  width: 6px;
}

.player-body::-webkit-scrollbar-track {
  background: transparent;
}

.player-body::-webkit-scrollbar-thumb {
  background: #2a2a4a;
  border-radius: 3px;
}

/* Album Art */
.art-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 10px 0;
}

.album-art {
  width: 160px;
  height: 160px;
  position: relative;
}

.vinyl-disc {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: conic-gradient(from 0deg, #1a1a2e, #2a2a4a, #1a1a2e, #2a2a4a, #1a1a2e);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 30px rgba(0, 0, 0, 0.5);
  transition: all 0.3s;
}

.album-art.is-playing .vinyl-disc {
  animation: spin-disc 4s linear infinite;
}

@keyframes spin-disc {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.vinyl-grooves {
  position: absolute;
  width: 85%;
  height: 85%;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
}

.groove {
  width: 70%;
  height: 70%;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.03);
}

.groove:nth-child(2) {
  width: 55%;
  height: 55%;
}

.groove:nth-child(3) {
  width: 40%;
  height: 40%;
}

.groove:nth-child(4) {
  width: 25%;
  height: 25%;
}

.vinyl-label {
  width: 30%;
  height: 30%;
  border-radius: 50%;
  background: linear-gradient(135deg, #e94560, #0f3460);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 1;
}

/* Track Info */
.track-info {
  text-align: center;
}

.track-title {
  margin: 0 0 4px;
  font-size: 15px;
  color: #e0e0e0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-status {
  margin: 0;
  font-size: 12px;
  color: #888;
}

.status-playing {
  color: #4ade80;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.status-playing .spin {
  animation: spin 1s linear infinite;
}

.status-paused {
  color: #fbbf24;
}

.status-idle {
  color: #555;
}

/* Progress */
.progress-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.time-display {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #888;
  font-variant-numeric: tabular-nums;
}

.progress-bar-wrapper {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #2a2a4a;
  cursor: pointer;
  position: relative;
}

.progress-bar {
  height: 100%;
  border-radius: 3px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #e94560, #ff5a75);
  border-radius: 3px;
  position: relative;
  transition: width 0.1s linear;
}

.progress-thumb {
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #e94560;
  opacity: 0;
  transition: opacity 0.2s;
}

.progress-bar-wrapper:hover .progress-thumb {
  opacity: 1;
}

/* Controls */
.controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
}

.ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: #e0e0e0;
  cursor: pointer;
  transition: all 0.2s;
}

.ctrl-btn:hover:not(:disabled) {
  background: rgba(233, 69, 96, 0.2);
  color: #e94560;
}

.ctrl-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.play-btn {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, #e94560, #ff5a75);
  color: #fff;
}

.play-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #ff5a75, #e94560);
  transform: scale(1.05);
}

/* Volume */
.volume-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px;
}

.volume-icon {
  cursor: pointer;
  color: #888;
  font-size: 18px;
  flex-shrink: 0;
}

.volume-icon:hover {
  color: #e94560;
}

.volume-value {
  font-size: 11px;
  color: #888;
  min-width: 32px;
  text-align: right;
  flex-shrink: 0;
}

/* Queue */
.queue-section {
  border-top: 1px solid #2a2a4a;
  padding-top: 12px;
  margin-top: auto;
}

.queue-section h5 {
  margin: 0 0 8px;
  font-size: 12px;
  color: #888;
  font-weight: 500;
}

.queue-list {
  max-height: 120px;
  overflow-y: auto;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.queue-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.queue-item.active {
  background: rgba(233, 69, 96, 0.1);
}

.queue-icon {
  color: #888;
  font-size: 14px;
  flex-shrink: 0;
}

.queue-item.active .queue-icon {
  color: #e94560;
}

.queue-name {
  flex: 1;
  font-size: 12px;
  color: #b0b0b0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.queue-item.active .queue-name {
  color: #e94560;
}

.playing-indicator {
  color: #e94560;
  font-size: 14px;
}

.playing-indicator.spin {
  animation: spin 1s linear infinite;
}
</style>
