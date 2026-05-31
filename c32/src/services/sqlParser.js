class SqlParser {
  parse(sql) {
    const upperSql = sql.trim().toUpperCase();
    const changes = [];
    
    if (upperSql.startsWith('CREATE TABLE')) {
      changes.push(this.parseCreateTable(sql));
    } else if (upperSql.startsWith('ALTER TABLE')) {
      changes.push(...this.parseAlterTable(sql));
    } else if (upperSql.startsWith('DROP TABLE')) {
      changes.push(this.parseDropTable(sql));
    }
    
    return changes;
  }
  
  parseCreateTable(sql) {
    const match = sql.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["']?([\w.]+)["']?)?\s*\(/i);
    const tableName = match ? this.extractTableName(match[1]) : null;
    
    return {
      type: 'CREATE_TABLE',
      tableName,
      operation: 'create'
    };
  }
  
  parseAlterTable(sql) {
    const changes = [];
    const tableMatch = sql.match(/ALTER\s+TABLE\s+(?:ONLY\s+)?(?:["']?([\w.]+)["']?)?/i);
    const tableName = tableMatch ? this.extractTableName(tableMatch[1]) : null;
    
    if (sql.match(/ADD\s+(?:COLUMN\s+)?["']?([\w]+)["']?/i)) {
      const columnMatch = sql.match(/ADD\s+(?:COLUMN\s+)?["']?([\w]+)["']?/i);
      const columnName = columnMatch ? columnMatch[1].replace(/["']/g, '') : null;
      
      changes.push({
        type: 'ALTER_TABLE_ADD_COLUMN',
        tableName,
        columnName,
        operation: 'add_column'
      });
    }
    
    if (sql.match(/DROP\sCOLUMN\s/i)) {
      const columnMatch = sql.match(/DROP\sCOLUMN\s*(?:IF\s+EXISTS\s+)?["']?([\w]+)["']?/i);
      const columnName = columnMatch ? columnMatch[1].replace(/["']/g, '') : null;
      
      changes.push({
        type: 'ALTER_TABLE_DROP_COLUMN',
        tableName,
        columnName,
        operation: 'drop_column'
      });
    }
    
    if (sql.match(/RENAME\sCOLUMN\s/i)) {
      const renameMatch = sql.match(/RENAME\sCOLUMN\s+["']?([\w]+)["']?\sTO\s+["']?([\w]+)["']?/i);
      if (renameMatch) {
        changes.push({
          type: 'ALTER_TABLE_RENAME_COLUMN',
          tableName,
          oldColumnName: renameMatch[1].replace(/["']/g, ''),
          newColumnName: renameMatch[2].replace(/["']/g, ''),
          operation: 'rename_column'
        });
      }
    }
    
    return changes;
  }
  
  parseDropTable(sql) {
    const match = sql.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:["']?([\w.]+)["']?)?/i);
    const tableName = match ? this.extractTableName(match[1]) : null;
    
    return {
      type: 'DROP_TABLE',
      tableName,
      operation: 'drop'
    };
  }
  
  extractTableName(fullName) {
    if (!fullName) return null;
    const parts = fullName.replace(/["']/g, '').split('.');
    return parts.length > 1 ? parts[1] : parts[0];
  }
}

module.exports = SqlParser;
