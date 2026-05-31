import { ipcMain, dialog } from 'electron';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as Database from 'better-sqlite3';
import * as path from 'path';
import * as dayjs from 'dayjs';

let db: Database.Database;

const getDb = () => {
  if (!db) {
    const userData = process.env.APPDATA || 
      (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
    const dbPath = path.join(userData, 'LogAnalyzer', 'logs.db');
    db = new Database(dbPath);
  }
  return db;
};

export const setupPDFExport = () => {
  ipcMain.handle('export-pdf', async (_, options: any) => {
    const db = getDb();
    
    const saveResult = await dialog.showSaveDialog({
      filters: [{ name: 'PDF文件', extensions: ['pdf'] }],
      defaultPath: `log-report.pdf'
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false };
    }

    const pdfDoc = await PDFDocument.create();
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    let yPosition = height - 50;

    page.drawText('日志分析报告', {
      x: 50,
      y: yPosition,
      size: 24,
      font: helveticaBoldFont,
      color: rgb(0, 0, 0),
    });

    yPosition -= 40;

    page.drawText(`生成时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`, {
      x: 50,
      y: yPosition,
      size: 12,
      font: helveticaFont,
    });

    yPosition -= 30;

    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) as errors,
        SUM(CASE WHEN level = 'WARN' THEN 1 ELSE 0 END) as warnings,
        SUM(CASE WHEN level = 'INFO' THEN 1 ELSE 0 END) as infos
      FROM logs
    `).get() as { total: number; errors: number; warnings: number; infos: number };

    page.drawText('统计概览', {
      x: 50,
      y: yPosition,
      size: 18,
      font: helveticaBoldFont,
    });

    yPosition -= 25;

    const statsLines = [
      `总日志数: ${stats.total}`,
      `ERROR级别: ${stats.errors}`,
      `WARN级别: ${stats.warnings}`,
      `INFO级别: ${stats.infos}`,
    ];

    for (const line of statsLines) {
      page.drawText(line, {
        x: 70,
        y: yPosition,
        size: 12,
        font: helveticaFont,
      });
      yPosition -= 20;
    }

    yPosition -= 20;

    page.drawText('最近错误日志', {
      x: 50,
      y: yPosition,
      size: 18,
      font: helveticaBoldFont,
    });

    yPosition -= 25;

    const recentErrors = db.prepare(`
      SELECT * FROM logs 
      WHERE level = 'ERROR'
      ORDER BY timestamp DESC
      LIMIT 10
    `).all() as any[];

    for (const error of recentErrors) {
      if (yPosition < 100) {
        page = pdfDoc.addPage();
        yPosition = height - 50;
      }

      const timeStr = dayjs(error.timestamp).format('YYYY-MM-DD HH:mm:ss');
      const message = error.message.length > 80 ? error.message.substring(0, 80) + '...' : error.message;

      page.drawText(`[${timeStr}] ${message}`, {
        x: 70,
        y: yPosition,
        size: 10,
        font: helveticaFont,
        color: rgb(0.8, 0, 0),
      });
      yPosition -= 18;
    }

    yPosition -= 20;

    if (yPosition < 100) {
      page = pdfDoc.addPage();
      yPosition = height - 50;
    }

    page.drawText('日志来源分布', {
      x: 50,
      y: yPosition,
      size: 18,
      font: helveticaBoldFont,
    });

    yPosition -= 25;

    const sources = db.prepare(`
      SELECT source, COUNT(*) as count
      FROM logs
      GROUP BY source
      ORDER BY count DESC
      LIMIT 5
    `).all() as { source: string; count: number }[];

    for (const source of sources) {
      page.drawText(`${source.source}: ${source.count}条`, {
        x: 70,
        y: yPosition,
        size: 12,
        font: helveticaFont,
      });
      yPosition -= 20;
    }

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(saveResult.filePath, pdfBytes);

    return { success: true, path: saveResult.filePath };
  });
};
