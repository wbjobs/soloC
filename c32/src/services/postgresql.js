const { Pool } = require('pg');
const config = require('../config');

let pool;

const connectPostgreSQL = async () => {
  pool = new Pool(config.postgresql);
  await pool.connect();
  console.log('PostgreSQL connected');
};

const getClient = () => pool;

const query = async (text, params) => {
  return pool.query(text, params);
};

const getTableOid = async (tableName, schemaName = 'public') => {
  const result = await query(
    `SELECT oid FROM pg_class WHERE relname = $1 AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`,
    [tableName, schemaName]
  );
  return result.rows[0]?.oid;
};

const getColumnOid = async (tableOid, columnName) => {
  const result = await query(
    `SELECT attnum FROM pg_attribute WHERE attrelid = $1 AND attname = $2 AND NOT attisdropped`,
    [tableOid, columnName]
  );
  return result.rows[0]?.attnum;
};

const getDependents = async (oid, columnAttnum = null) => {
  let queryText;
  let params;
  
  if (columnAttnum !== null) {
    queryText = `
    SELECT DISTINCT
      d.refobjid,
      d.classid,
      d.objid,
      c.relname as dependent_name,
      c.relkind as dependent_type,
      n.nspname as schema_name,
      d.refobjsubid as column_ref
    FROM pg_depend d
    JOIN pg_class c ON d.refobjid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE d.objid = $1
    AND d.objsubid = $2
    AND d.deptype IN ('n', 'a', 'i')
    AND c.relkind IN ('v', 'm', 'r', 't', 'S', 'f')
    `;
    params = [oid, columnAttnum];
  } else {
    queryText = `
    SELECT DISTINCT
      d.refobjid,
      d.classid,
      d.objid,
      c.relname as dependent_name,
      c.relkind as dependent_type,
      n.nspname as schema_name,
      d.refobjsubid as column_ref
    FROM pg_depend d
    JOIN pg_class c ON d.refobjid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE d.objid = $1
    AND d.deptype IN ('n', 'a', 'i')
    AND c.relkind IN ('v', 'm', 'r', 't', 'S', 'f')
    `;
    params = [oid];
  }
  
  const result = await query(queryText, params);
  return result.rows;
};

const getMaterializedViewColumnDependencies = async (tableOid, columnName = null) => {
  let whereClause = '';
  let params = [tableOid];
  
  if (columnName) {
    whereClause = `AND a.attname = $2`;
    params.push(columnName);
  }
  
  const result = await query(
    `
    SELECT DISTINCT
      mv.oid as mv_oid,
      mv.relname as mv_name,
      n.nspname as schema_name,
      a.attname as column_name,
      pg_get_viewdef(mv.oid) as definition
    FROM pg_rewrite r
    JOIN pg_class mv ON r.ev_class = mv.oid
    JOIN pg_namespace n ON mv.relnamespace = n.oid
    JOIN pg_depend d ON d.objid = r.oid
    JOIN pg_attribute a ON d.refobjid = a.attrelid AND d.refobjsubid = a.attnum
    WHERE mv.relkind = 'm'
    AND d.refobjid = $1
    ${whereClause}
    AND NOT a.attisdropped
    `,
    params
  );
  return result.rows;
};

const getViewDefinition = async (viewOid) => {
  const result = await query(
    `
    SELECT pg_get_viewdef($1) as definition
    `,
    [viewOid]
  );
  return result.rows[0]?.definition;
};

const getStoredProcedures = async () => {
  const result = await query(
    `
    SELECT 
      p.oid,
      p.proname as procedure_name,
      n.nspname as schema_name,
      pg_get_functiondef(p.oid) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.prokind IN ('f', 'p')
    `
  );
  return result.rows;
};

const getTriggers = async () => {
  const result = await query(
    `
    SELECT 
      t.oid,
      t.tgname as trigger_name,
      c.relname as table_name,
      n.nspname as schema_name,
      pg_get_triggerdef(t.oid) as definition
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE NOT t.tgisinternal
    `
  );
  return result.rows;
};

const getMaterializedViews = async () => {
  const result = await query(
    `
    SELECT 
      c.oid,
      c.relname as view_name,
      n.nspname as schema_name,
      pg_get_viewdef(c.oid) as definition
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relkind = 'm'
    `
  );
  return result.rows;
};

const getMaterializedViewsBySchema = async (schemaName) => {
  const result = await query(
    `
    SELECT 
      c.oid,
      c.relname as view_name,
      n.nspname as schema_name,
      pg_get_viewdef(c.oid) as definition
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relkind = 'm'
    AND n.nspname = $1
    `,
    [schemaName]
  );
  return result.rows;
};

const getViewsBySchema = async (schemaName) => {
  const result = await query(
    `
    SELECT 
      c.oid,
      c.relname as view_name,
      n.nspname as schema_name,
      pg_get_viewdef(c.oid) as definition
    FROM pg_class c
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relkind = 'v'
    AND n.nspname = $1
    `,
    [schemaName]
  );
  return result.rows;
};

const getStoredProceduresBySchema = async (schemaName) => {
  const result = await query(
    `
    SELECT 
      p.oid,
      p.proname as procedure_name,
      n.nspname as schema_name,
      pg_get_functiondef(p.oid) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.prokind IN ('f', 'p')
    AND n.nspname = $1
    `,
    [schemaName]
  );
  return result.rows;
};

const getTriggersBySchema = async (schemaName) => {
  const result = await query(
    `
    SELECT 
      t.oid,
      t.tgname as trigger_name,
      c.relname as table_name,
      n.nspname as schema_name,
      pg_get_triggerdef(t.oid) as definition
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE NOT t.tgisinternal
    AND n.nspname = $1
    `,
    [schemaName]
  );
  return result.rows;
};

module.exports = {
  connectPostgreSQL,
  getClient,
  query,
  getTableOid,
  getColumnOid,
  getDependents,
  getMaterializedViewColumnDependencies,
  getViewDefinition,
  getStoredProcedures,
  getStoredProceduresBySchema,
  getTriggers,
  getTriggersBySchema,
  getMaterializedViews,
  getMaterializedViewsBySchema,
  getViewsBySchema
};
