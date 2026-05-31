const { diffChars } = require('diff');
const crypto = require('crypto');

class DiffCalculator {
  calculateDOMHash(domString) {
    return crypto.createHash('sha256').update(domString).digest('hex');
  }

  compareSnapshots(snapshot1, snapshot2) {
    const textDiffs = this.compareText(snapshot1.content, snapshot2.content);
    const attrDiffs = this.compareAttributes(snapshot1.content, snapshot2.content);
    
    const allDiffs = [...textDiffs, ...attrDiffs];
    const stats = this.calculateStats(allDiffs);

    return {
      diffs: allDiffs,
      stats,
      hasChanges: allDiffs.length > 0
    };
  }

  compareText(html1, html2) {
    const text1 = this.extractText(html1);
    const text2 = this.extractText(html2);
    
    const changes = diffChars(text1, text2);
    const diffs = [];
    
    let currentDiff = null;
    changes.forEach((part) => {
      if (part.added || part.removed) {
        diffs.push({
          type: 'text',
          action: part.added ? 'added' : 'removed',
          value: part.value,
          length: part.value.length
        });
      }
    });

    return diffs;
  }

  extractText(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  compareAttributes(html1, html2) {
    const attrs1 = this.parseAttributes(html1);
    const attrs2 = this.parseAttributes(html2);
    const diffs = [];

    const allPaths = new Set([...Object.keys(attrs1), ...Object.keys(attrs2)]);

    allPaths.forEach(path => {
      const elem1 = attrs1[path] || {};
      const elem2 = attrs2[path] || {};
      const allAttrs = new Set([...Object.keys(elem1), ...Object.keys(elem2)]);

      allAttrs.forEach(attr => {
        const val1 = elem1[attr];
        const val2 = elem2[attr];

        if (val1 !== val2) {
          if (!val1 && val2) {
            diffs.push({
              type: 'attribute',
              action: 'added',
              path,
              attribute: attr,
              value: val2
            });
          } else if (val1 && !val2) {
            diffs.push({
              type: 'attribute',
              action: 'removed',
              path,
              attribute: attr,
              value: val1
            });
          } else {
            diffs.push({
              type: 'attribute',
              action: 'modified',
              path,
              attribute: attr,
              oldValue: val1,
              newValue: val2
            });
          }
        }
      });
    });

    return diffs;
  }

  parseAttributes(html) {
    const attrs = {};
    const tagRegex = /<(\w+)([^>]*)>/g;
    let match;
    let pathIndex = 0;

    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const attrString = match[2];
      const path = `${tag}[${pathIndex++}]`;
      attrs[path] = {};

      const attrRegex = /(\w+)\s*=\s*(["'])(.*?)\2/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        attrs[path][attrMatch[1]] = attrMatch[3];
      }
    }

    return attrs;
  }

  calculateStats(diffs) {
    let changedNodes = new Set();
    let addedText = 0;
    let removedText = 0;

    diffs.forEach(diff => {
      if (diff.path) {
        changedNodes.add(diff.path);
      }
      
      if (diff.type === 'text') {
        if (diff.action === 'added') {
          addedText += diff.length;
        } else if (diff.action === 'removed') {
          removedText += diff.length;
        }
      }
    });

    return {
      changedNodes: changedNodes.size,
      addedText,
      removedText
    };
  }

  generateDiffHTML(diffResult) {
    return diffResult.diffs.map(diff => {
      if (diff.type === 'text') {
        const className = diff.action === 'added' ? 'diff-added' : 'diff-removed';
        return `<span class="${className}">${this.escapeHtml(diff.value)}</span>`;
      } else {
        return `<div class="diff-attribute">
          <span class="diff-path">${diff.path}</span>
          <span class="diff-action">${diff.action}</span>
          <span class="diff-attr-name">${diff.attribute}</span>
          ${diff.oldValue ? `<span class="diff-old">${this.escapeHtml(diff.oldValue)}</span>` : ''}
          ${diff.newValue ? `<span class="diff-new">${this.escapeHtml(diff.newValue)}</span>` : ''}
        </div>`;
      }
    }).join('');
  }

  escapeHtml(text) {
    const div = document?.createElement('div');
    if (div) {
      div.textContent = text;
      return div.innerHTML;
    }
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = new DiffCalculator();
