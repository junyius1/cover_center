<template>
  <div class="app-root">
    <!-- Top Bar -->
    <header class="top-bar">
      <div class="top-bar-left">
        <el-icon class="logo-icon"><Headset /></el-icon>
        <span class="app-title">Car Audio Player</span>
      </div>
      <div class="top-bar-right">
        <span class="webdav-status" :class="webdavStatusClass">
          <el-icon v-if="webdavStatus === 'connected'" class="status-dot"><CircleCheckFilled /></el-icon>
          <el-icon v-else-if="webdavStatus === 'loading'" class="status-dot"><Loading /></el-icon>
          <el-icon v-else class="status-dot"><CircleCloseFilled /></el-icon>
          WebDAV: {{ webdavStatusLabel }}
        </span>
      </div>
    </header>

    <!-- Main 3-Column Layout -->
    <main class="dashboard">
      <!-- Left Column: WebDAV File Browser -->
      <section class="column left-column">
        <FileBrowser @track-selected="onTrackFromWebDAV" />
      </section>

      <!-- Center Column: Playlist Manager -->
      <section class="column center-column">
        <PlaylistManager ref="playlistRef" @track-selected="onTrackSelected" />
      </section>

      <!-- Right Column: Audio Player -->
      <section class="column right-column">
        <AudioPlayer
          :track-name="currentTrackName"
          :track-url="currentTrackUrl"
        />
      </section>
    </main>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Headset, CircleCheckFilled, CircleCloseFilled, Loading } from '@element-plus/icons-vue'
import FileBrowser from './components/FileBrowser.vue'
import PlaylistManager from './components/PlaylistManager.vue'
import AudioPlayer from './components/AudioPlayer.vue'
import { listDirectory } from './services/webdav.js'

const playlistRef = ref(null)
const currentTrackName = ref('No track selected')
const currentTrackUrl = ref('')

const webdavStatus = ref('loading')
const webdavStatusLabel = computed(() => {
  if (webdavStatus.value === 'connected') return 'Connected'
  if (webdavStatus.value === 'loading') return 'Connecting...'
  return 'Offline'
})
const webdavStatusClass = computed(() => {
  if (webdavStatus.value === 'connected') return 'status-connected'
  if (webdavStatus.value === 'loading') return 'status-loading'
  return 'status-offline'
})

// Check WebDAV connection on mount
async function checkWebDAV() {
  try {
    await listDirectory()
    webdavStatus.value = 'connected'
  } catch {
    webdavStatus.value = 'error'
  }
}

// When clicking a file in the WebDAV browser, add it to the playlist and play it
function onTrackFromWebDAV(track) {
  // Add to playlist via the playlist ref
  if (playlistRef.value?.addTrack) {
    playlistRef.value.addTrack({
      id: track.url,
      name: track.name,
      url: track.url,
    })
  }
  // Play it immediately
  onTrackSelected(track)
}

function onTrackSelected(track) {
  currentTrackName.value = track.name
  currentTrackUrl.value = track.url
}

checkWebDAV()
</script>

<style scoped>
.app-root {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: #0f0f23;
  overflow: hidden;
}

/* ===== Top Bar ===== */
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  height: 56px;
  min-height: 56px;
  background: linear-gradient(135deg, #1a1a3e 0%, #0f3460 100%);
  border-bottom: 1px solid #2a2a5a;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
}

.top-bar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-icon {
  font-size: 24px;
  color: #e94560;
}

.app-title {
  font-size: 18px;
  font-weight: 600;
  color: #e0e0e0;
  letter-spacing: 0.5px;
}

.top-bar-right {
  display: flex;
  align-items: center;
}

.webdav-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
}

.status-dot {
  font-size: 10px;
}

.status-connected {
  color: #4ade80;
}

.status-connected .status-dot {
  color: #4ade80;
}

.status-loading {
  color: #fbbf24;
}

.status-loading .status-dot {
  color: #fbbf24;
  animation: spin 1s linear infinite;
}

.status-offline {
  color: #f87171;
}

.status-offline .status-dot {
  color: #f87171;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===== Dashboard Layout ===== */
.dashboard {
  flex: 1;
  display: flex;
  gap: 0;
  overflow: hidden;
  padding: 16px;
}

.column {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

/* Left Column: WebDAV Explorer - 30% */
.left-column {
  width: 30%;
  min-width: 280px;
  max-width: 420px;
  background: #16213e;
}

/* Center Column: Playlist Manager - 40% */
.center-column {
  flex: 1;
  min-width: 320px;
  background: #1a1a3e;
}

/* Right Column: Audio Player - 30% */
.right-column {
  width: 30%;
  min-width: 300px;
  max-width: 420px;
  background: linear-gradient(180deg, #16213e 0%, #1a1a2e 100%);
}

/* Column Dividers */
.left-column {
  border-right: 1px solid #2a2a4a;
}

.center-column {
  border-right: 1px solid #2a2a4a;
}

/* ===== Responsive ===== */
@media (max-width: 1200px) {
  .dashboard {
    flex-direction: column;
    overflow-y: auto;
  }

  .column {
    width: 100% !important;
    max-width: none !important;
    min-width: 0 !important;
    height: auto !important;
    border-right: none !important;
    border-bottom: 1px solid #2a2a4a;
  }

  .left-column,
  .center-column,
  .right-column {
    height: 45vh;
  }
}

@media (max-width: 768px) {
  .app-title {
    font-size: 14px;
  }

  .dashboard {
    padding: 8px;
  }

  .left-column,
  .center-column,
  .right-column {
    height: 33vh;
  }
}
</style>
