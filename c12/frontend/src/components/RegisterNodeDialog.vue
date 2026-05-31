<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'submit', data: any): Promise<boolean>
}>()

const formRef = ref()

const form = reactive({
  type: 'ETHEREUM',
  name: '',
  endpoint: '',
  username: '',
  password: ''
})

const rules = {
  type: [
    { required: true, message: 'Please select node type', trigger: 'change' }
  ],
  name: [
    { required: true, message: 'Please enter node name', trigger: 'blur' },
    { min: 2, max: 50, message: 'Name should be 2 to 50 characters', trigger: 'blur' }
  ],
  endpoint: [
    { required: true, message: 'Please enter endpoint URL', trigger: 'blur' }
  ]
}

const dialogVisible = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  dialogVisible.value = val
})

watch(dialogVisible, (val) => {
  emit('update:modelValue', val)
  if (!val) {
    resetForm()
  }
})

function resetForm() {
  form.type = 'ETHEREUM'
  form.name = ''
  form.endpoint = ''
  form.username = ''
  form.password = ''
  formRef.value?.resetFields()
}

async function handleSubmit() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  const submitData = {
    type: form.type,
    name: form.name,
    endpoint: form.endpoint
  }

  if (form.type === 'BITCOIN') {
    Object.assign(submitData, {
      username: form.username,
      password: form.password
    })
  }

  const success = await emit('submit', submitData)
  if (success) {
    ElMessage.success('Node registered successfully')
  } else {
    ElMessage.error('Failed to register node')
  }
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    title="Register New Node"
    width="500px"
    :close-on-click-modal="false"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
    >
      <el-form-item label="Node Type" prop="type">
        <el-select v-model="form.type" style="width: 100%;">
          <el-option label="Ethereum" value="ETHEREUM" />
          <el-option label="Bitcoin" value="BITCOIN" />
        </el-select>
      </el-form-item>

      <el-form-item label="Node Name" prop="name">
        <el-input v-model="form.name" placeholder="e.g., Main Ethereum Node" />
      </el-form-item>

      <el-form-item label="Endpoint" prop="endpoint">
        <el-input 
          v-model="form.endpoint" 
          :placeholder="form.type === 'ETHEREUM' ? 'http://localhost:8545' : 'localhost:8332'"
        />
        <div class="hint">
          {{ form.type === 'ETHEREUM' 
            ? 'Ethereum: http(s)://host:port' 
            : 'Bitcoin: host:port (without http://)' 
          }}
        </div>
      </el-form-item>

      <template v-if="form.type === 'BITCOIN'">
        <el-form-item label="Username">
          <el-input v-model="form.username" placeholder="RPC username" />
        </el-form-item>

        <el-form-item label="Password">
          <el-input 
            v-model="form.password" 
            type="password" 
            placeholder="RPC password"
            show-password
          />
        </el-form-item>
      </template>
    </el-form>

    <template #footer>
      <span class="dialog-footer">
        <el-button @click="dialogVisible = false">Cancel</el-button>
        <el-button type="primary" @click="handleSubmit">Register</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<style scoped>
.hint {
  font-size: 12px;
  color: #909399;
  margin-top: 5px;
}
</style>
