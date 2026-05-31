import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';

interface DecisionItem {
  content: string;
  timestamp: string;
  speaker: string;
}

interface TodoItem {
  task: string;
  assignee: string;
  deadline: Date;
  completed: boolean;
  timestamp: string;
}

interface MeetingAnalysisResult {
  title: string;
  overview: string;
  decisions: DecisionItem[];
  todos: TodoItem[];
  keyPoints: string[];
  duration: string;
}

@Injectable()
export class MeetingAnalysisService {
  private readonly apiKey: string;
  private readonly apiUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
  }

  async analyzeMeeting(transcription: string, meetingTitle?: string): Promise<MeetingAnalysisResult> {
    try {
      const prompt = this.buildAnalysisPrompt(transcription, meetingTitle);
      
      const response = await lastValueFrom(
        this.httpService.post(
          this.apiUrl,
          {
            model: 'gpt-3.5-turbo-16k',
            messages: [
              {
                role: 'system',
                content: '你是一个专业的会议纪要助手，负责分析会议转录文本，提取关键信息。请以JSON格式返回结果。',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          },
          {
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const content = response.data.choices[0].message.content;
      const analysisResult = JSON.parse(content);
      
      return this.normalizeResult(analysisResult, transcription);
    } catch (error) {
      console.error('Meeting analysis error:', error.response?.data || error.message);
      return this.fallbackAnalysis(transcription, meetingTitle);
    }
  }

  private buildAnalysisPrompt(transcription: string, meetingTitle?: string): string {
    return `
请分析以下会议转录文本，提取关键信息并以JSON格式返回。

${meetingTitle ? `会议标题: ${meetingTitle}` : ''}

会议转录内容:
${transcription}

请提取以下信息并以JSON格式返回:

{
  "title": "根据内容生成的会议标题",
  "overview": "会议内容的简要概述（100-200字）",
  "decisions": [
    {
      "content": "决策内容描述",
      "timestamp": "原文中出现的时间标记（如有的话）",
      "speaker": "发言人（如能识别）"
    }
  ],
  "todos": [
    {
      "task": "待办任务描述",
      "assignee": "负责人（如能识别）",
      "deadline": "截止日期（YYYY-MM-DD格式，如能识别）",
      "timestamp": "原文中出现的时间标记"
    }
  ],
  "keyPoints": ["关键点1", "关键点2", "关键点3"],
  "duration": "会议时长估算（如XX分钟）"
}

注意:
1. 决策是会议中确定的结论或方案
2. 待办事项是需要后续执行的任务
3. 关键点是会议中的重要讨论内容
4. 如果某些信息无法确定，请留空或使用合理的默认值
5. 确保输出是有效的JSON格式
`;
  }

  private normalizeResult(result: any, transcription: string): MeetingAnalysisResult {
    const defaultResult: MeetingAnalysisResult = {
      title: result.title || '会议纪要',
      overview: result.overview || '会议内容概述',
      decisions: Array.isArray(result.decisions) ? result.decisions.map(d => ({
        content: d.content || d,
        timestamp: d.timestamp || '',
        speaker: d.speaker || '',
      })) : [],
      todos: Array.isArray(result.todos) ? result.todos.map(t => ({
        task: t.task || t,
        assignee: t.assignee || '',
        deadline: t.deadline ? new Date(t.deadline) : null,
        completed: false,
        timestamp: t.timestamp || '',
      })) : [],
      keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
      duration: result.duration || this.estimateDuration(transcription),
    };

    return defaultResult;
  }

  private fallbackAnalysis(transcription: string, meetingTitle?: string): MeetingAnalysisResult {
    const decisions = this.extractDecisions(transcription);
    const todos = this.extractTodos(transcription);
    
    return {
      title: meetingTitle || '会议纪要',
      overview: this.generateOverview(transcription),
      decisions,
      todos,
      keyPoints: this.extractKeyPoints(transcription),
      duration: this.estimateDuration(transcription),
    };
  }

  private extractDecisions(transcription: string): DecisionItem[] {
    const decisionKeywords = ['决定', '决议', '确定', '同意', '通过', '结论', '达成一致'];
    const decisions: DecisionItem[] = [];
    
    const sentences = transcription.split(/[。！？.!?]+/);
    
    for (const sentence of sentences) {
      if (decisionKeywords.some(keyword => sentence.includes(keyword))) {
        decisions.push({
          content: sentence.trim(),
          timestamp: '',
          speaker: '',
        });
      }
    }
    
    return decisions.slice(0, 10);
  }

  private extractTodos(transcription: string): TodoItem[] {
    const todoKeywords = ['需要', '应该', '必须', '待办', '要做', '任务', '负责', '跟进'];
    const todos: TodoItem[] = [];
    
    const sentences = transcription.split(/[。！？.!?]+/);
    
    for (const sentence of sentences) {
      if (todoKeywords.some(keyword => sentence.includes(keyword))) {
        todos.push({
          task: sentence.trim(),
          assignee: '',
          deadline: null,
          completed: false,
          timestamp: '',
        });
      }
    }
    
    return todos.slice(0, 15);
  }

  private extractKeyPoints(transcription: string): string[] {
    const sentences = transcription.split(/[。！？.!?]+/);
    const keyPoints = sentences
      .filter(s => s.trim().length > 15)
      .slice(0, 8)
      .map(s => s.trim());
    
    return keyPoints;
  }

  private generateOverview(transcription: string): string {
    const sentences = transcription.split(/[。！？.!?]+/);
    const firstFew = sentences.slice(0, 5).join('。');
    return firstFew.length > 200 ? firstFew.substring(0, 200) + '...' : firstFew;
  }

  private estimateDuration(transcription: string): string {
    const charsPerMinute = 150;
    const minutes = Math.ceil(transcription.length / charsPerMinute);
    return `${Math.max(minutes, 5)}分钟`;
  }

  async extractActionItems(transcription: string): Promise<{
    decisions: DecisionItem[];
    todos: TodoItem[];
  }> {
    const analysis = await this.analyzeMeeting(transcription);
    return {
      decisions: analysis.decisions,
      todos: analysis.todos,
    };
  }
}