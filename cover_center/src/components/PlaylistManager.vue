<template>
  <div class="playlist-manager">
    <div class="manager-header">
      <h3>
        <el-icon><List /></el-icon>
        Playlist Manager
      </h3>
      <div class="header-actions">
        <el-button size="small" :icon="Plus" @click="showAddFolderDialog = true">
          New Folder
        </el-button>
        <el-button size="small" :icon="Delete" @click="clearPlaylist" :disabled="playlist.length === 0">
          Clear
        </el-button>
      </div>
    </div>

    <div class="playlist-content" @dragover.prevent @drop="handleDrop">
      <el-tree
        ref="treeRef"
        :data="treeData"
        :props="treeProps"
        node-key="id"
        draggable
        :allow-drag="allowDrag"
        @node-click="handleNodeClick"
        @node-drag-end="handleDragEnd"
      >
        <template #default="{ node, data }">
          <span class="custom-node" :class="{ 'is-folder': data.type === 'folder' }">
            <el-icon v-if="data.type === 'folder'" class="node-icon folder">
              <Folder />
            </el-icon>
            <el-icon v-else class="node-icon music">
              <Headset />
            </el-icon>
            <span class="node-label">{{ node.label }}</span>
            <el-icon
              v-if="data.type === 'track' && data.url"
              class="node-action"
              @click.stop="playTrack(data)"
            >
              <VideoPlay />
            </el-icon>
            <el-icon v-if="data.type === 'track'" class="node-action remove" @click.stop="removeTrack(data)">
              <Close />
            </el-icon>
          </span>
        </template>
      </el-tree>

      <div v-if="playlist.length === 0" class="empty-state">
        <el-icon :size="48" color="#555"><Headset /></el-icon>
        <p>No tracks in playlist</p>
        <p class="hint">Click files in the WebDAV Explorer to add them</p>
      </div>
    </div>

    <!-- Add Folder Dialog -->
    <el-dialog
      v-model="showAddFolderDialog"
      title="Create New Folder"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form @submit.prevent="createFolder">
        <el-form-item label="Folder Name" required>
          <el-input v-model="newFolderName" placeholder="Enter folder name..." autofocus />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddFolderDialog = false">Cancel</el-button>
        <el-button type="primary" @click="createFolder" :disabled="!newFolderName.trim()">
          Create
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElTree, ElDialog, ElForm, ElFormItem, ElInput, ElButton, ElMessage } from 'element-plus'
import { List, Plus, Delete, Folder, Headset, VideoPlay, Close } from '@element-plus/icons-vue'

const emit = defineEmits(['track-selected'])

const treeRef = ref(null)
const showAddFolderDialog = ref(false)
const newFolderName = ref('')
let nextId = 1

const playlist = ref([
  { id: '__root__', name: 'My Playlist', type: 'folder', children: [] },
])

const treeData = computed(() => {
  const root = playlist.value.find((p) => p.id === '__root__')
  return root ? [root] : []
})

const treeProps = {
  label: 'name',
  children: 'children',
}

function generateId() {
  return `track_${nextId++}_${Date.now()}`
}

function findNodeById(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.children) {
      const found = findNodeById(node.children, id)
      if (found) return found
    }
  }
  return null
}

function findParentNode(nodes, id, parent = null) {
  for (const node of nodes) {
    if (node.id === id) return parent
    if (node.children) {
      const found = findParentNode(node.children, id, node)
      if (found !== undefined) return found
    }
  }
  return undefined
}

function addTrack(track) {
  const root = playlist.value.find((p) => p.id === '__root__')
  if (!root) return

  const exists = findNodeById(root.children, track.id)
  if (exists) {
    ElMessage.warning('Track already in playlist')
    return
  }

  root.children.push(track)
  ElMessage.success(`Added: ${track.name}`)
}

function removeTrack(track) {
  const root = playlist.value.find((p) => p.id === '__root__')
  if (!root) return

  const idx = root.children.findIndex((c) => c.id === track.id)
  if (idx !== -1) {
    root.children.splice(idx, 1)
    ElMessage.info(`Removed: ${track.name}`)
  }
}

function playTrack(track) {
  emit('track-selected', {
    name: track.name,
    url: track.url,
  })
}

function handleNodeClick(data) {
  if (data.type === 'track') {
    playTrack(data)
  }
}

function createFolder() {
  const name = newFolderName.value.trim()
  if (!name) return

  const root = playlist.value.find((p) => p.id === '__root__')
  if (!root) return

  root.children.push({
    id: generateId(),
    name,
    type: 'folder',
    children: [],
  })

  newFolderName.value = ''
  showAddFolderDialog.value = false
  ElMessage.success(`Folder "${name}" created`)
}

function clearPlaylist() {
  const root = playlist.value.find((p) => p.id === '__root__')
  if (root) root.children = []
  ElMessage.info('Playlist cleared')
}

function allowDrag({ node }) {
  return node.data.type === 'track'
}

function handleDragEnd() {
  // Reorder could be implemented here if needed
}

function handleDrop(event) {
  // Drop from external source (e.g., WebDAV browser)
}

defineExpose({ addTrack, playlist })
</script>

<style scoped>
.playlist-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #16213e;
  border-radius: 12px;
  overflow: hidden;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #0f3460, #1a1a40);
  border-bottom: 1px solid #2a2a5a;
}

.manager-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e0e0e0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.manager-header h3 .el-icon {
  color: #00d2ff;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.playlist-content {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
  transition: background 0.2s;
}

.playlist-content::-webkit-scrollbar {
  width: 6px;
}

.playlist-content::-webkit-scrollbar-track {
  background: #16213e;
}

.playlist-content::-webkit-scrollbar-thumb {
  background: #2a2a5a;
  border-radius: 3px;
}

:deep(.el-tree-node__content) {
  height: 38px;
  border-radius: 6px;
  margin: 2px 8px;
  transition: background 0.2s;
}

:deep(.el-tree-node__content:hover) {
  background: rgba(0, 210, 255, 0.08);
}

:deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: rgba(0, 210, 255, 0.15);
  color: #00d2ff;
}

.custom-node {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  padding: 0 4px;
  overflow: hidden;
}

.custom-node.is-folder {
  font-weight: 500;
}

.node-icon {
  flex-shrink: 0;
  font-size: 16px;
}

.node-icon.folder {
  color: #f0a500;
}

.node-icon.music {
  color: #00d2ff;
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #ccc;
}

:deep(.el-tree-node.is-current > .el-tree-node__content .node-label) {
  color: #fff;
}

.node-action {
  flex-shrink: 0;
  cursor: pointer;
  color: #666;
  font-size: 14px;
  transition: color 0.2s;
  padding: 2px;
}

.node-action:hover {
  color: #00d2ff;
}

.node-action.remove:hover {
  color: #e94560;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: #555;
}

.empty-state p {
  margin: 0;
  font-size: 14px;
}

.empty-state .hint {
  font-size: 12px;
  color: #444;
}
</style>
