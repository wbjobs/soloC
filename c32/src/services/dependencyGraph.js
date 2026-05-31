class DependencyGraphGenerator {
  generateDotGraph(changes, affectedObjects) {
    const nodes = new Set();
    const edges = [];
    const nodeStyles = {};
    
    for (const change of changes) {
      const tableNode = `table_${change.tableName}`;
      nodes.add(tableNode);
      nodeStyles[tableNode] = this.getNodeStyle('TABLE', change.type, true);
      
      if (change.columnName) {
        const columnNode = `column_${change.tableName}_${change.columnName}`;
        nodes.add(columnNode);
        nodeStyles[columnNode] = this.getNodeStyle('COLUMN', change.type, true);
        edges.push({ from: tableNode, to: columnNode, label: 'contains' });
      }
    }
    
    for (const obj of affectedObjects) {
      const objNode = `obj_${obj.objectType}_${obj.objectName}`;
      nodes.add(objNode);
      nodeStyles[objNode] = this.getNodeStyle(obj.objectType, null, false, obj.riskLevel);
      
      const tableNode = `table_${obj.tableName}`;
      const edgeLabel = obj.columnName 
        ? `references ${obj.columnName}` 
        : 'depends on';
      
      edges.push({
        from: objNode,
        to: tableNode,
        label: edgeLabel,
        riskLevel: obj.riskLevel
      });
    }
    
    return this.generateDotOutput(nodes, edges, nodeStyles, changes);
  }
  
  getNodeStyle(objectType, changeType = null, isSource = false, riskLevel = null) {
    const colors = {
      high: '#ff4444',
      medium: '#ffbb33',
      low: '#00C851',
      TABLE: '#33b5e5',
      VIEW: '#2bbbad',
      MATERIALIZED_VIEW: '#0099CC',
      STORED_PROCEDURE: '#aa66cc',
      TRIGGER: '#ff8800',
      COLUMN: '#669900'
    };
    
    const shapes = {
      TABLE: 'box',
      VIEW: 'ellipse',
      MATERIALIZED_VIEW: 'hexagon',
      STORED_PROCEDURE: 'diamond',
      TRIGGER: 'triangle',
      COLUMN: 'oval'
    };
    
    let fillColor = colors[objectType] || '#cccccc';
    let penColor = '#000000';
    let penWidth = 1;
    
    if (riskLevel) {
      fillColor = colors[riskLevel];
      penWidth = riskLevel === 'high' ? 3 : (riskLevel === 'medium' ? 2 : 1);
    }
    
    if (isSource) {
      penColor = '#cc0000';
      penWidth = 3;
    }
    
    return {
      shape: shapes[objectType] || 'box',
      fillColor,
      penColor,
      penWidth,
      style: 'filled'
    };
  }
  
  generateDotOutput(nodes, edges, nodeStyles, changes) {
    const lines = [];
    
    lines.push('digraph ImpactAnalysis {');
    lines.push('  graph [rankdir=LR, fontsize=12, fontname="Arial", bgcolor="#f8f9fa"];');
    lines.push('  node [fontsize=10, fontname="Arial"];');
    lines.push('  edge [fontsize=8, fontname="Arial"];');
    lines.push('');
    
    lines.push('  // =======================================');
    lines.push('  // Title and Legend');
    lines.push('  // =======================================');
    lines.push('  subgraph cluster_legend {');
    lines.push('    label = "Legend | Risk Levels";');
    lines.push('    style = rounded;');
    lines.push('    bgcolor = #e9ecef;');
    lines.push('    node [shape=box, style=filled];');
    lines.push('    legend_high [label="High Risk", fillcolor="#ff4444", fontcolor=white];');
    lines.push('    legend_medium [label="Medium Risk", fillcolor="#ffbb33"];');
    lines.push('    legend_low [label="Low Risk", fillcolor="#00C851", fontcolor=white];');
    lines.push('  }');
    lines.push('');
    
    lines.push('  // =======================================');
    lines.push('  // Object Type Legend');
    lines.push('  // =======================================');
    lines.push('  subgraph cluster_types {');
    lines.push('    label = "Object Types";');
    lines.push('    style = rounded;');
    lines.push('    bgcolor = #e9ecef;');
    lines.push('    type_table [label="Table", shape=box, fillcolor="#33b5e5"];');
    lines.push('    type_view [label="View", shape=ellipse, fillcolor="#2bbbad"];');
    lines.push('    type_mv [label="Materialized View", shape=hexagon, fillcolor="#0099CC"];');
    lines.push('    type_proc [label="Stored Proc", shape=diamond, fillcolor="#aa66cc"];');
    lines.push('    type_trigger [label="Trigger", shape=triangle, fillcolor="#ff8800"];');
    lines.push('  }');
    lines.push('');
    
    lines.push('  // =======================================');
    lines.push('  // Source Nodes (Tables/Columns being changed)');
    lines.push('  // =======================================');
    lines.push('  subgraph cluster_source {');
    lines.push('    label = "Schema Change Source";');
    lines.push('    style = filled;');
    lines.push('    bgcolor = #fff3cd;');
    lines.push('    color = #ffc107;');
    lines.push('');
    
    const uniqueTableNodes = new Set();
    for (const change of changes) {
      const tableNode = `table_${change.tableName}`;
      if (!uniqueTableNodes.has(tableNode)) {
        uniqueTableNodes.add(tableNode);
        const style = nodeStyles[tableNode];
        lines.push(`    ${tableNode} [label="${change.tableName}", shape=${style.shape}, fillcolor="${style.fillColor}", color="${style.penColor}", penwidth=${style.penWidth}];`);
      }
      
      if (change.columnName) {
        const columnNode = `column_${change.tableName}_${change.columnName}`;
        const colStyle = nodeStyles[columnNode];
        lines.push(`    ${columnNode} [label="${change.columnName}", shape=${colStyle.shape}, fillcolor="${colStyle.fillColor}", color="${colStyle.penColor}", penwidth=${colStyle.penWidth}];`);
      }
    }
    lines.push('  }');
    lines.push('');
    
    lines.push('  // =======================================');
    lines.push('  // Affected Objects');
    lines.push('  // =======================================');
    lines.push('  subgraph cluster_affected {');
    lines.push('    label = "Affected Objects";');
    lines.push('    style = filled;');
    lines.push('    bgcolor = #f8d7da;');
    lines.push('    color = #dc3545;');
    lines.push('');
    
    const uniqueObjNodes = new Set();
    for (const obj of affectedObjects) {
      const objNode = `obj_${obj.objectType}_${obj.objectName}`;
      if (!uniqueObjNodes.has(objNode)) {
        uniqueObjNodes.add(objNode);
        const style = nodeStyles[objNode];
        const displayLabel = `${obj.objectName}\\n(${obj.objectType})`;
        lines.push(`    ${objNode} [label="${displayLabel}", shape=${style.shape}, fillcolor="${style.fillColor}", color="${style.penColor}", penwidth=${style.penWidth}];`);
      }
    }
    lines.push('  }');
    lines.push('');
    
    lines.push('  // =======================================');
    lines.push('  // Dependencies (Edges)');
    lines.push('  // =======================================');
    
    const uniqueEdges = new Set();
    for (const edge of edges) {
      const edgeKey = `${edge.from}->${edge.to}`;
      if (!uniqueEdges.has(edgeKey)) {
        uniqueEdges.add(edgeKey);
        
        let edgeColor = '#6c757d';
        let edgeWidth = 1;
        let edgeStyle = 'solid';
        
        if (edge.riskLevel === 'high') {
          edgeColor = '#dc3545';
          edgeWidth = 3;
          edgeStyle = 'bold';
        } else if (edge.riskLevel === 'medium') {
          edgeColor = '#ffc107';
          edgeWidth = 2;
        }
        
        lines.push(`  ${edge.from} -> ${edge.to} [label="${edge.label}", color="${edgeColor}", penwidth=${edgeWidth}, style=${edgeStyle}];`);
      }
    }
    
    lines.push('');
    lines.push('  // =======================================');
    lines.push('  // Ranking');
    lines.push('  // =======================================');
    lines.push('  { rank=same; legend_high; legend_medium; legend_low; }');
    lines.push('  { rank=same; type_table; type_view; type_mv; type_proc; type_trigger; }');
    
    lines.push('}');
    
    return lines.join('\n');
  }
  
  generateGraphSummary(changes, affectedObjects) {
    return {
      totalNodes: affectedObjects.length + changes.length,
      totalEdges: affectedObjects.length,
      highRiskCount: affectedObjects.filter(o => o.riskLevel === 'high').length,
      mediumRiskCount: affectedObjects.filter(o => o.riskLevel === 'medium').length,
      lowRiskCount: affectedObjects.filter(o => o.riskLevel === 'low').length,
      affectedObjectTypes: this.countObjectTypes(affectedObjects),
      changeTypes: this.countChangeTypes(changes)
    };
  }
  
  countObjectTypes(affectedObjects) {
    const counts = {};
    for (const obj of affectedObjects) {
      counts[obj.objectType] = (counts[obj.objectType] || 0) + 1;
    }
    return counts;
  }
  
  countChangeTypes(changes) {
    const counts = {};
    for (const change of changes) {
      counts[change.type] = (counts[change.type] || 0) + 1;
    }
    return counts;
  }
}

module.exports = DependencyGraphGenerator;
