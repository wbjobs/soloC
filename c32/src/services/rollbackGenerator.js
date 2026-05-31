class RollbackGenerator {
  generateRollbackScript(changes, affectedObjects) {
    const scripts = [];
    const warnings = [];
    
    for (const change of changes) {
      switch (change.type) {
        case 'ALTER_TABLE_DROP_COLUMN':
          scripts.push(this.generateDropColumnRollback(change));
          break;
        case 'ALTER_TABLE_ADD_COLUMN':
          scripts.push(this.generateAddColumnRollback(change));
          break;
        case 'ALTER_TABLE_RENAME_COLUMN':
          scripts.push(this.generateRenameColumnRollback(change));
          break;
        case 'CREATE_TABLE':
          scripts.push(this.generateCreateTableRollback(change));
          break;
        case 'DROP_TABLE':
          scripts.push(this.generateDropTableRollback(change));
          break;
        default:
          warnings.push(`Unknown change type: ${change.type}`);
      }
    }
    
    const highRiskObjects = affectedObjects.filter(o => o.riskLevel === 'high');
    if (highRiskObjects.length > 0) {
      warnings.push(`WARNING: ${highRiskObjects.length} high-risk objects will be affected!`);
    }
    
    return {
      rollbackScript: this.wrapInTransaction(scripts.join('\n\n')),
      warnings: warnings,
      affectedObjects: affectedObjects,
      dataPreservationNotes: this.generateDataPreservationNotes(changes)
    };
  }
  
  generateDropColumnRollback(change) {
    const tempTableName = `temp_${change.tableName}_${change.columnName}_${Date.now()}`;
    
    return `-- =======================================
-- ROLLBACK for DROP COLUMN: ${change.tableName}.${change.columnName}
-- =======================================

-- Step 1: Create temporary table to preserve data
CREATE TEMPORARY TABLE ${tempTableName} AS
SELECT ${change.columnName}
FROM ${change.tableName};

-- Step 2: Create index on temporary table for performance
CREATE INDEX idx_${tempTableName}_id ON ${tempTableName}(${change.columnName});

-- Step 3: Execute the original change (this is what we're rolling back from)
-- ALTER TABLE ${change.tableName} DROP COLUMN ${change.columnName};

-- =======================================
-- ACTUAL ROLLBACK STEPS (run these to revert)
-- =======================================

-- Step R1: Restore the column (you may need to adjust data type)
ALTER TABLE ${change.tableName}
ADD COLUMN ${change.columnName} <DATA_TYPE>;

-- Step R2: Restore data from temporary table
UPDATE ${change.tableName} t
SET ${change.columnName} = temp.${change.columnName}
FROM ${tempTableName} temp
WHERE t.id = temp.id; -- Adjust JOIN condition to match your primary key

-- Step R3: Drop temporary table
DROP TABLE ${tempTableName};`;
  }
  
  generateAddColumnRollback(change) {
    return `-- =======================================
-- ROLLBACK for ADD COLUMN: ${change.tableName}.${change.columnName}
-- =======================================

-- WARNING: This will DROP the column and ALL data in it!
-- Consider backing up the column first:
-- CREATE TEMPORARY TABLE backup_${change.tableName}_${change.columnName} AS
-- SELECT ${change.columnName} FROM ${change.tableName};

-- =======================================
-- ACTUAL ROLLBACK STEPS
-- =======================================
ALTER TABLE ${change.tableName}
DROP COLUMN ${change.columnName} CASCADE;`;
  }
  
  generateRenameColumnRollback(change) {
    return `-- =======================================
-- ROLLBACK for RENAME COLUMN: ${change.tableName}.${change.oldColumnName} -> ${change.tableName}.${change.newColumnName}
-- =======================================

-- =======================================
-- ACTUAL ROLLBACK STEPS
-- =======================================
ALTER TABLE ${change.tableName}
RENAME COLUMN ${change.newColumnName} TO ${change.oldColumnName};`;
  }
  
  generateCreateTableRollback(change) {
    return `-- =======================================
-- ROLLBACK for CREATE TABLE: ${change.tableName}
-- =======================================

-- WARNING: This will DROP the table and ALL data in it!
-- Consider backing up the table first:
-- CREATE TABLE backup_${change.tableName} AS SELECT * FROM ${change.tableName};

-- =======================================
-- ACTUAL ROLLBACK STEPS
-- =======================================
DROP TABLE IF EXISTS ${change.tableName} CASCADE;`;
  }
  
  generateDropTableRollback(change) {
    return `-- =======================================
-- ROLLBACK for DROP TABLE: ${change.tableName}
-- =======================================

-- NOTE: To properly roll back DROP TABLE, you need:
-- 1. The original CREATE TABLE statement
-- 2. A backup of the data
-- 3. All indexes, constraints, and triggers

-- =======================================
-- EXAMPLE ROLLBACK (customize as needed)
-- =======================================
-- CREATE TABLE ${change.tableName} (
--   -- Add your column definitions here
-- );

-- -- Restore data from backup
-- INSERT INTO ${change.tableName}
-- SELECT * FROM backup_${change.tableName};`;
  }
  
  generateDataPreservationNotes(changes) {
    const notes = [];
    
    for (const change of changes) {
      if (change.type === 'ALTER_TABLE_DROP_COLUMN') {
        notes.push({
          type: 'CRITICAL',
          message: `Column ${change.tableName}.${change.columnName} will be PERMANENTLY DELETED. Ensure temp table backup is created BEFORE running the change.`
        });
      }
      if (change.type === 'DROP_TABLE') {
        notes.push({
          type: 'CRITICAL',
          message: `Table ${change.tableName} will be PERMANENTLY DELETED. Create a full backup BEFORE running the change.`
        });
      }
      if (change.type === 'ALTER_TABLE_ADD_COLUMN') {
        notes.push({
          type: 'INFO',
          message: `Adding column ${change.tableName}.${change.columnName}. Rollback will drop this column - ensure no data is written to it before rollback.`
        });
      }
    }
    
    return notes;
  }
  
  wrapInTransaction(script) {
    return `-- =======================================
-- ROLLBACK SCRIPT - GENERATED AUTOMATICALLY
-- WARNING: TEST THIS SCRIPT IN A STAGING ENVIRONMENT FIRST!
-- =======================================

BEGIN;

${script}

-- =======================================
-- VERIFICATION STEPS (run after rollback)
-- =======================================
-- 1. Verify column exists: SELECT column_name FROM information_schema.columns WHERE table_name = '<table_name>';
-- 2. Verify data integrity: SELECT COUNT(*) FROM <table_name>;
-- 3. Verify dependent objects still work

COMMIT;

-- If something goes wrong, run: ROLLBACK;`;
  }
}

module.exports = RollbackGenerator;
