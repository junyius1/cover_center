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
      <el-empty v-if="treeData.length === 0" description="Click files from WebDAV Explorer" :image-size="60" />

      <el-tree
        v-else
        ref="treeRef"
        :data="treeData"
        :props="treeProps"
        node-key="id"
        :default-expanded-keys="expandedKeys"
        draggable
        :allow-drag="allowDrag"
        @node-click="handleNodeClick"
      >
        <template #default="{ node, data }">
          <span class="custom-node" :class="{ 'is-folder': data.type === 'folder' }">
            <el-icon v-if="data.type === 'folder'" class="node-icon folder">
              <FolderOpened />
            </el-icon>
            <el-icon v-else class="node-icon music">
              <Headset />
            </el-icon>
            <span class="node-label" :title="data.name">{{ node.label }}</span>
            <el-icon
              v-if="data.type === 'track' && data.url"
              class="node-action play-btn"
              @click.stop="playTrack(data)"
            >
              <VideoPlay />
            </el-icon>
            <el-icon v-if="data.type === 'track'" class="node-action remove" @click.stop="removeTrack(data)">
              <CircleCloseFilled />
            </el-icon>
          </span>
        </template>
      </el-tree>
    </div>

    <!-- Add Folder Dialog -->
    <el-dialog
      v-model="showAddFolderDialog"
      title="Create New Folder"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form>
        <el-form-item label="Folder Name">
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
import { ElMessage } from 'element-plus'
import { List, Plus, Delete, FolderOpened, Headset, VideoPlay, CircleCloseFilled } from '@element-plus/icons-vue'

const emit = defineEmits(['track-selected'])

const treeRef = ref(null)
const showAddFolderDialog = ref(false)
const newFolderName = ref('')
let nextId = 1

const playlist = ref([])
const expandedKeys = ref([])

const treeData = computed(() => playlist.value)

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

function findParentByPath(nodes, id, path = []) {
  for (const node of nodes) {
    const currentPath = [...path, node.id]
    if (node.id === id) return currentPath
    if (node.children) {
      const found = findParentByPath(node.children, id, currentPath)
      if (found) return found
    }
  }
  return null
}

function addToParent(parentId, item) {
  const root = playlist.value.find((p) => p.id === parentId)
  if (root) {
    if (!root.children) root.children = []
    root.children.push(item)
  }
}

function addTrack(track, parentPath = null) {
  const root = playlist.value.find((p) => p.id === '__root__')
  if (!root) return

  const exists = findNodeById(root.children || [], track.id)
  if (exists) {
    ElMessage.warning('Track already in playlist')
    return
  }

  if (parentPath && parentPath.length > 0) {
    const targetFolder = findNodeById(root.children || [], parentPath[parentPath.length - 1])
    if (targetFolder) {
      if (!targetFolder.children) targetFolder.children = []
      targetFolder.children.push(track)
    } else {
      root.children.push(track)
    }
  } else {
    if (!root.children) root.children = []
    root.children.push(track)
  }

  ElMessage.success(`Added: ${track.name}`)
}

function addFolderToParent(parentId, name) {
  const root = playlist.value.find((p) => p.id === parentId)
  if (root) {
    if (!root.children) root.children = []
    root.children.push({
      id: generateId(),
      name,
      type: 'folder',
      children: [],
    })
    return true
  }
  return false
}

function removeTrack(track) {
  const root = playlist.value.find((p) => p.id === '__root__')
  if (!root) return

  function removeFromChildren(children) {
    const idx = children.findIndex((c) => c.id === track.id)
    if (idx !== -1) {
      children.splice(idx, 1)
      return true
    }
    for (const child of children) {
      if (child.children && removeFromChildren(child.children)) return true
    }
    return false
  }

  if (root.children && removeFromChildren(root.children)) {
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

function handleDrop(event) {
  // External drop target
}

function addTrackFromWebDAV(name, url, folderId = null) {
  const track = {
    id: generateId(),
    name,
    type: 'track',
    url,
  }

  const root = playlist.value.find((p) => p.id === '__root__')
  if (!root) return

  if (folderId) {
    const parentPath = findParentByPath(root.children || [], folderId)
    if (parentPath) {
      let target = root
      for (let i = 0; i < parentPath.length; i++) {
        target = (target.children || []).find((c) => c.id === parentPath[i])
        if (!target) break
      }
      if (target && target.type === 'folder') {
        if (!target.children) target.children = []
        target.children.push(track)
        return
      }
    }
  }

  if (!root.children) root.children = []
  root.children.push(track)
  ElMessage.success(`Added: ${name}`)
}

defineExpose({ addTrack: addTrackFromWebDAV, playlist })
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

.folder {
  color: #fbbf24;
}

.music {
  color: #4ade80;
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.node-action {
  flex-shrink: 0;
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.15s;
  cursor: pointer;
}

.custom-node:hover .node-action {
  opacity: 0.7;
}

.node-action.play-btn {
  color: #00d2ff;
}

.node-action.play-btn:hover {
  opacity: 1;
  color: #00e5ff;
}

.node-action.remove:hover {
  opacity: 1;
  color: #f87171;
}

:deep(.el-empty) {
  margin-top: 60px;
}
</style>
