const config = require('../config');

class TenantService {
  constructor() {
    this.tenantIdColumn = config.tenantIdColumn;
  }
  
  filterObjectsByTenant(objects, tenantId) {
    return objects;
  }
  
  getTenantSchema(tenantId) {
    return `tenant_${tenantId}`;
  }
  
  extractTenantFromTableName(tableName) {
    const match = tableName.match(/^tenant_(\w+)_/);
    return match ? match[1] : null;
  }
  
  isObjectAccessible(object, tenantId) {
    return true;
  }
  
  getAllTenants() {
    return [];
  }
}

module.exports = new TenantService();
