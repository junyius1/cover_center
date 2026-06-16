<template>
  <div class="file-browser">
    <div class="browser-header">
      <h3>
        <el-icon><FolderOpened /></el-icon>
        WebDAV Explorer
      </h3>
      <el-button size="small" :icon="Refresh" @click="loadRoot" :loading="loading">
        Refresh
      </el-button>
    </div>
    <div class="tree-container">
      <el-tree
        :data="treeData"
        :props="treeProps"
        node-key="path"
        default-expand-all
        :expand-on-click-node="false"
        :load="loadNode"
        lazy
        @node-click="handleNodeClick"
      >
        <template #default="{ node, data }">
          <span class="custom-tree-node">
            <el-icon v-if="data.isDirectory" class="node-icon folder-icon">
              <Folder />
            </el-icon>
            <el-icon v-else class="node-icon">
              <Headset />
            </el-icon>
            <span>{{ node.label }}</span>
            <el-tag v-if="data.fileCount" size="small" type="info" class="file-count">
              {{ data.fileCount }} files
            </el-tag>
          </span>
        </template>
      </el-tree>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElTree } from 'element-plus'
import { FolderOpened, Refresh, Folder, Headset } from '@element-plus/icons-vue'
import { listDirectory } from '../services/webdav.js'

const emit = defineEmits(['folder-selected'])

const loading = ref(false)
const treeData = ref([])
const treeProps = {
  label: 'name',
  isLeaf: (data) => !data.isDirectory,
}

const ROOT_PATH = '共享文件/百度云/ubuntu/精选海量车载音乐【持续更新】/'

async function loadRoot() {
  loading.value = true
  try {
    const items = await listDirectory(ROOT_PATH)
    const folders = items.filter((i) => i.isDirectory).map((i) => ({
      ...i,
      path: i.href,
      isLeaf: false,
      fileCount: 0,
    }))
    const files = items.filter((i) => !i.isDirectory)
    treeData.value = [...folders]
    if (files.length > 0) {
      treeData.value.push({
        name: `🎵 ${files.length} MP3 files`,
        isDirectory: false,
        isLeaf: true,
        path: '__files__',
        fileCount: files.length,
        files,
      })
    }
  } catch (err) {
    console.error('Failed to load root:', err)
    treeData.value = [{
      name: 'Error loading WebDAV',
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

  try {
    const parentPath = node.data.path || ROOT_PATH
    const items = await listDirectory(parentPath)
    const folders = items
      .filter((i) => i.isDirectory)
      .map((i) => ({
        ...i,
        path: i.href,
        isLeaf: false,
      }))
    const mp3Files = items.filter((i) => /\.mp3$/i.test(i.href))
    resolve([...folders, ...mp3Files.map((f) => ({
      ...f,
      isLeaf: true,
      isDirectory: false,
    }))])
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
    emit('folder-selected', {
      name: data.name,
      url: data.href,
      isDirectory: data.isDirectory,
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
  background: rgba(233, 69, 96, 0.1);
}

:deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: rgba(233, 69, 96, 0.2);
  color: #e94560;
}

.custom-tree-node {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-icon {
  flex-shrink: 0;
  color: #e94560;
}

.folder-icon {
  color: #f0a500;
}

.file-count {
  margin-left: auto;
  font-size: 11px;
}
</style>
