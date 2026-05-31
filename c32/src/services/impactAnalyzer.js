const SqlParser = require('./sqlParser');
const tenantService = require('./tenantService');
const RollbackGenerator = require('./rollbackGenerator');
const DependencyGraphGenerator = require('./dependencyGraph');
const {
  getTableOid,
  getColumnOid,
  getDependents,
  getMaterializedViewColumnDependencies,
  getStoredProceduresBySchema,
  getTriggersBySchema,
  getMaterializedViewsBySchema,
  getViewsBySchema
} = require('./postgresql');
const { calculateRisk } = require('./riskAssessment');

class ImpactAnalyzer {
  constructor() {
    this.parser = new SqlParser();
    this.rollbackGenerator = new RollbackGenerator();
    this.graphGenerator = new DependencyGraphGenerator();
  }
  
  async analyze(sql, currentTenantId, targetTenants = null) {
    const changes = this.parser.parse(sql);
    const affectedObjects = [];
    
    const schemas = this.getTargetSchemas(currentTenantId, targetTenants);
    
    for (const change of changes) {
      for (const schema of schemas) {
        const tableOid = await getTableOid(change.tableName, schema);
        
        if (!tableOid) {
          continue;
        }
        
        if (change.type === 'ALTER_TABLE_DROP_COLUMN' && change.columnName) {
          const columnAttnum = await getColumnOid(tableOid, change.columnName);
          
          if (columnAttnum) {
            const columnDependents = await getDependents(tableOid, columnAttnum);
            for (const dep of columnDependents) {
              const objectType = this.mapObjectType(dep.dependent_type);
              if (objectType && dep.schema_name === schema) {
                affectedObjects.push({
                  objectName: dep.dependent_name,
                  objectType,
                  schemaName: dep.schema_name,
                  changeType: change.type,
                  tableName: change.tableName,
                  columnName: change.columnName,
                  tenantId: this.extractTenantFromSchema(dep.schema_name)
                });
              }
            }
            
            const mvDeps = await getMaterializedViewColumnDependencies(tableOid, change.columnName);
            for (const mv of mvDeps) {
              if (mv.schema_name === schema) {
                affectedObjects.push({
                  objectName: mv.mv_name,
                  objectType: 'MATERIALIZED_VIEW',
                  schemaName: mv.schema_name,
                  changeType: change.type,
                  tableName: change.tableName,
                  columnName: change.columnName,
                  referencedColumn: mv.column_name,
                  tenantId: this.extractTenantFromSchema(mv.schema_name)
                });
              }
            }
          }
        }
        
        const dependents = await getDependents(tableOid);
        for (const dep of dependents) {
          const objectType = this.mapObjectType(dep.dependent_type);
          if (objectType && dep.schema_name === schema) {
            affectedObjects.push({
              objectName: dep.dependent_name,
              objectType,
              schemaName: dep.schema_name,
              changeType: change.type,
              tableName: change.tableName,
              tenantId: this.extractTenantFromSchema(dep.schema_name)
            });
          }
        }
        
        await this.analyzeSchemaObjects(schema, change, affectedObjects);
      }
    }
    
    const uniqueObjects = this.deduplicateObjects(affectedObjects);
    
    const objectsWithRisk = uniqueObjects.map(obj => ({
      ...obj,
      riskLevel: calculateRisk(obj)
    }));
    
    const overallRisk = this.calculateOverallRisk(objectsWithRisk);
    
    const rollbackInfo = this.rollbackGenerator.generateRollbackScript(changes, objectsWithRisk);
    const dependencyGraphDot = this.graphGenerator.generateDotGraph(changes, objectsWithRisk);
    const graphSummary = this.graphGenerator.generateGraphSummary(changes, objectsWithRisk);
    
    return {
      affectedObjects: objectsWithRisk,
      overallRisk,
      totalAffected: objectsWithRisk.length,
      changes: changes,
      analyzedSchemas: schemas,
      rollback: rollbackInfo,
      dependencyGraph: {
        dotFormat: dependencyGraphDot,
        summary: graphSummary
      }
    };
  }
  
  async analyzeSchemaObjects(schema, change, affectedObjects) {
    const procedures = await getStoredProceduresBySchema(schema);
    for (const proc of procedures) {
      if (this.definitionReferencesTable(proc.definition, change.tableName, change.columnName)) {
        affectedObjects.push({
          objectName: proc.procedure_name,
          objectType: 'STORED_PROCEDURE',
          schemaName: proc.schema_name,
          changeType: change.type,
          tableName: change.tableName,
          columnName: change.columnName,
          tenantId: this.extractTenantFromSchema(proc.schema_name)
        });
      }
    }
    
    const triggers = await getTriggersBySchema(schema);
    for (const trigger of triggers) {
      if (trigger.table_name === change.tableName || 
          this.definitionReferencesTable(trigger.definition, change.tableName, change.columnName)) {
        affectedObjects.push({
          objectName: trigger.trigger_name,
          objectType: 'TRIGGER',
          schemaName: trigger.schema_name,
          changeType: change.type,
          tableName: change.tableName,
          columnName: change.columnName,
          tenantId: this.extractTenantFromSchema(trigger.schema_name)
        });
      }
    }
    
    const materializedViews = await getMaterializedViewsBySchema(schema);
    for (const view of materializedViews) {
      if (this.definitionReferencesTable(view.definition, change.tableName, change.columnName)) {
        affectedObjects.push({
          objectName: view.view_name,
          objectType: 'MATERIALIZED_VIEW',
          schemaName: view.schema_name,
          changeType: change.type,
          tableName: change.tableName,
          columnName: change.columnName,
          tenantId: this.extractTenantFromSchema(view.schema_name)
        });
      }
    }
    
    const views = await getViewsBySchema(schema);
    for (const view of views) {
      if (this.definitionReferencesTable(view.definition, change.tableName, change.columnName)) {
        affectedObjects.push({
          objectName: view.view_name,
          objectType: 'VIEW',
          schemaName: view.schema_name,
          changeType: change.type,
          tableName: change.tableName,
          columnName: change.columnName,
          tenantId: this.extractTenantFromSchema(view.schema_name)
        });
      }
    }
  }
  
  getTargetSchemas(currentTenantId, targetTenants) {
    const schemas = [];
    
    if (targetTenants && targetTenants.length > 0) {
      for (const tenantId of targetTenants) {
        schemas.push(tenantService.getTenantSchema(tenantId));
      }
    } else {
      schemas.push(tenantService.getTenantSchema(currentTenantId));
    }
    
    return schemas;
  }
  
  extractTenantFromSchema(schemaName) {
    return tenantService.extractTenantFromSchema(schemaName) || 'public';
  }
  
  mapObjectType(relkind) {
    const typeMap = {
      'v': 'VIEW',
      'm': 'MATERIALIZED_VIEW',
      'r': 'TABLE',
      'i': 'INDEX',
      'S': 'SEQUENCE',
      'c': 'TYPE',
      't': 'TOAST_TABLE',
      'f': 'FOREIGN_TABLE'
    };
    return typeMap[relkind];
  }
  
  definitionReferencesTable(definition, tableName, columnName = null) {
    if (!definition || !tableName) return false;
    
    const tableRegex = new RegExp(`\\b${tableName}\\b`, 'i');
    const hasTableReference = tableRegex.test(definition);
    
    if (!hasTableReference) return false;
    
    if (columnName) {
      const columnRegex = new RegExp(`\\b${columnName}\\b`, 'i');
      return columnRegex.test(definition);
    }
    
    return true;
  }
  
  deduplicateObjects(objects) {
    const seen = new Set();
    return objects.filter(obj => {
      const key = `${obj.objectName}-${obj.objectType}-${obj.schemaName}-${obj.changeType}-${obj.columnName || 'no-col'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  calculateOverallRisk(objects) {
    const highRisk = objects.filter(o => o.riskLevel === 'high').length;
    const mediumRisk = objects.filter(o => o.riskLevel === 'medium').length;
    
    if (highRisk > 0) return 'high';
    if (mediumRisk > 0) return 'medium';
    return 'low';
  }
}

module.exports = ImpactAnalyzer;
