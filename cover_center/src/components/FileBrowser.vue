<template>
  <div class="file-browser">
    <div class="browser-header">
      <h3>
        <el-icon><FolderOpened /></el-icon>
        WebDAV Explorer
      </h3>
      <div class="header-actions">
        <el-tag size="small" type="info" class="root-label">Root</el-tag>
        <el-button size="small" :icon="Refresh" @click="loadRoot" :loading="loading">
          Refresh
        </el-button>
      </div>
    </div>
    <div class="tree-container">
      <el-tree
        ref="treeRef"
        :data="treeData"
        :props="treeProps"
        node-key="webdavPath"
        :expand-on-click-node="true"
        :load="loadNode"
        lazy
        @node-click="handleNodeClick"
      >
        <template #default="{ node, data }">
          <span class="custom-tree-node">
            <el-icon v-if="data.isDirectory" class="node-icon folder-icon">
              <FolderOpened />
            </el-icon>
            <el-icon v-else class="node-icon music-icon">
              <Headset />
            </el-icon>
            <span class="node-label" :title="data.name">{{ data.name }}</span>
            <el-tag v-if="data.fileCount" size="small" type="success" class="file-count">
              {{ data.fileCount }}
            </el-tag>
          </span>
        </template>
      </el-tree>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { FolderOpened, Refresh, Headset } from '@element-plus/icons-vue'
import { listDirectory, getRootPath } from '../services/webdav.js'

const emit = defineEmits(['track-selected'])

const treeRef = ref(null)
const loading = ref(false)
const treeData = ref([])

const treeProps = {
  label: 'name',
  isLeaf: (data) => !data.isDirectory,
}

const ROOT_PATH = getRootPath()

async function loadRoot() {
  loading.value = true
  try {
    const items = await listDirectory(ROOT_PATH)
    const folders = items
      .filter((i) => i.isDirectory)
      .map((i) => ({
        ...i,
        path: i.webdavPath,
        isLeaf: false,
        fileCount: 0,
      }))
    const mp3Files = items.filter((i) => !i.isDirectory)
    treeData.value = [...folders]
    if (mp3Files.length > 0) {
      treeData.value.push({
        name: `Music (${mp3Files.length} files)`,
        isDirectory: true,
        isLeaf: false,
        path: '__mp3s__',
        fileCount: mp3Files.length,
        mp3Files,
      })
    }
  } catch (err) {
    console.error('Failed to load root:', err)
    treeData.value = [{
      name: 'Error loading WebDAV — check server',
      isDirectory: false,
      isLeaf: true,
      path: '__error__',
    }]
  } finally {
    loading.value = false
  }
}

async function loadNode(node, resolve) {
  if (node.level === 0) {
    return resolve([{
      name: '精选海量车载音乐【持续更新】',
      isDirectory: true,
      isLeaf: false,
      path: ROOT_PATH,
    }])
  }

  if (node.data.path === '__mp3s__') {
    const files = node.data.mp3Files || []
    return resolve(files.map((f) => ({
      ...f,
      isDirectory: false,
      isLeaf: true,
      path: f.webdavPath,
    })))
  }

  try {
    // node.data.path contains the FULL path from WebDAV root
    const parentPath = node.data.path
    const items = await listDirectory(parentPath)
    const folders = items
      .filter((i) => i.isDirectory)
      .map((i) => ({
        ...i,
        path: i.webdavPath,
        isLeaf: false,
      }))
    const mp3Files = items
      .filter((i) => /\.mp3$/i.test(i.href))
      .map((f) => ({
        ...f,
        isLeaf: true,
        isDirectory: false,
        path: f.webdavPath,
      }))
    resolve([...folders, ...mp3Files])
  } catch (err) {
    console.error('Failed to load node:', err)
    resolve([{
      name: 'Error loading',
      isDirectory: false,
      isLeaf: true,
      path: '__error__',
    }])
  }
}

function handleNodeClick(data) {
  if (!data.isDirectory) {
    emit('track-selected', {
      name: data.name,
      url: data.href,
    })
  }
}

onMounted(() => {
  loadRoot()
})
</script>

<style scoped>
.file-browser {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #1a1a2e;
  border-radius: 12px;
  overflow: hidden;
}

.browser-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: linear-gradient(135deg, #16213e, #0f3460);
  border-bottom: 1px solid #2a2a4a;
}

.browser-header h3 {
  margin: 0;
  font-size: 16px;
  color: #e0e0e0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.browser-header h3 .el-icon {
  color: #e94560;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.root-label {
  font-size: 11px;
  padding: 2px 8px;
}

.tree-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.tree-container::-webkit-scrollbar {
  width: 6px;
}

.tree-container::-webkit-scrollbar-track {
  background: #1a1a2e;
}

.tree-container::-webkit-scrollbar-thumb {
  background: #2a2a4a;
  border-radius: 3px;
}

:deep(.el-tree-node__content) {
  height: 36px;
  border-radius: 6px;
  margin: 2px 8px;
  transition: background 0.2s;
}

:deep(.el-tree-node__content:hover) {
  background: rgba(233, 69, 96, 0.08);
}

:deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: rgba(233, 69, 96, 0.15);
  color: #e94560;
}

.custom-tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  padding: 0 4px;
  overflow: hidden;
}

.node-icon {
  flex-shrink: 0;
  font-size: 16px;
}

.folder-icon {
  color: #fbbf24;
}

.music-icon {
  color: #4ade80;
}

.node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.file-count {
  font-size: 10px;
  padding: 0 6px;
  height: 18px;
  line-height: 18px;
  flex-shrink: 0;
}
</style>
