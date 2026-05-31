import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

export const getLatestData = (location) => {
  return api.get('/records/latest/', { params: { location } })
}

export const getRecordsByLocation = (location) => {
  return api.get('/records/by_location/', { params: { location } })
}

export const compareSources = (location, metric) => {
  return api.get('/records/compare_sources/', { params: { location, metric } })
}

export const getFusedData = (location) => {
  return api.get('/records/fused_data/', { params: { location } })
}

export const getPrediction = (location, daysAhead) => {
  return api.get('/records/predict/', { params: { location, days_ahead: daysAhead } })
}

export const getPredictionSummary = (location, daysAhead) => {
  return api.get('/records/prediction_summary/', { params: { location, days_ahead: daysAhead } })
}

export const getAlerts = (location) => {
  return api.get('/records/alerts/', { params: { location } })
}

export const getStatistics = (location, dataSource) => {
  return api.get('/records/statistics/', { params: { location, data_source: dataSource } })
}

export const getLocations = () => {
  return api.get('/records/locations/')
}

export const getDataSources = () => {
  return api.get('/records/data_sources/')
}

export const getTimeSeries = (location, metric) => {
  return api.get('/records/time_series/', { params: { location, metric } })
}

export const exportData = (location, dataSource, startTime, endTime, format = 'csv') => {
  const params = { location, data_source: dataSource, format }
  if (startTime) params.start_time = startTime
  if (endTime) params.end_time = endTime
  return api.get('/records/export/', { params })
}

export const downloadCSV = (content, filename) => {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const downloadExcel = (base64Content, filename) => {
  const binaryString = window.atob(base64Content)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default api
