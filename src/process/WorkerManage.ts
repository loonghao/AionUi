/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import { ProcessChat } from './initStorage';
import type AgentBaseTask from './task/BaseAgentManager';
import { getDatabase } from './database/index';

const taskList: {
  id: string;
  task: AgentBaseTask<unknown>;
}[] = [];

/**
 * Runtime options for building conversations
 * Used by cron jobs to force yoloMode
 */
export interface BuildConversationOptions {
  /** Force yolo mode (auto-approve all tool calls) */
  yoloMode?: boolean;
  /** Skip task cache - create a new isolated instance */
  skipCache?: boolean;
}

const getTaskById = (id: string) => {
  return taskList.find((item) => item.id === id)?.task;
};

const buildConversation = async (conversation: TChatConversation, options?: BuildConversationOptions): Promise<AgentBaseTask<unknown> | null> => {
  // If not skipping cache, check for existing task
  if (!options?.skipCache) {
    const task = getTaskById(conversation.id);
    if (task) {
      return task;
    }
  }

  let task: AgentBaseTask<unknown> | null = null;

  switch (conversation.type) {
    case 'gemini': {
      const { GeminiAgentManager } = await import('./task/GeminiAgentManager');
      task = new GeminiAgentManager(
        {
          workspace: conversation.extra.workspace,
          conversation_id: conversation.id,
          webSearchEngine: conversation.extra.webSearchEngine,
          presetRules: conversation.extra.presetRules,
          contextContent: conversation.extra.contextContent,
          enabledSkills: conversation.extra.enabledSkills,
          yoloMode: options?.yoloMode,
          sessionMode: conversation.extra.sessionMode,
        },
        conversation.model
      );
      break;
    }
    case 'acp': {
      const { default: AcpAgentManager } = await import('./task/AcpAgentManager');
      task = new AcpAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        yoloMode: options?.yoloMode,
      });
      break;
    }
    case 'codex': {
      const { CodexAgentManager } = await import('@/agent/codex');
      task = new CodexAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        yoloMode: options?.yoloMode,
        sessionMode: conversation.extra.sessionMode,
      });
      break;
    }
    case 'openclaw-gateway': {
      const { default: OpenClawAgentManager } = await import('./task/OpenClawAgentManager');
      task = new OpenClawAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        yoloMode: options?.yoloMode,
      });
      break;
    }
    case 'nanobot': {
      const { default: NanoBotAgentManager } = await import('./task/NanoBotAgentManager');
      task = new NanoBotAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        yoloMode: options?.yoloMode,
      });
      break;
    }
    default: {
      return null;
    }
  }

  if (task && !options?.skipCache) {
    taskList.push({ id: conversation.id, task });
  }
  return task;
};

const getTaskByIdRollbackBuild = async (id: string, options?: BuildConversationOptions): Promise<AgentBaseTask<unknown>> => {
  console.log(`[WorkerManage] getTaskByIdRollbackBuild: id=${id}, options=${JSON.stringify(options)}`);

  // If not skipping cache, check for existing task
  if (!options?.skipCache) {
    const task = taskList.find((item) => item.id === id)?.task;
    if (task) {
      console.log(`[WorkerManage] Found existing task in memory for: ${id}`);
      return Promise.resolve(task);
    }
  }

  // Try to load from database first
  const db = getDatabase();
  const dbResult = db.getConversation(id);
  console.log(`[WorkerManage] Database lookup result: success=${dbResult.success}, hasData=${!!dbResult.data}`);

  if (dbResult.success && dbResult.data) {
    console.log(`[WorkerManage] Building conversation from database: ${id}`);
    const task = await buildConversation(dbResult.data, options);
    if (task) return task;
  }

  // Fallback to file storage
  const list = (await ProcessChat.get('chat.history')) as TChatConversation[] | undefined;
  const conversation = list?.find((item) => item.id === id);
  if (conversation) {
    console.log(`[WorkerManage] Building conversation from file storage: ${id}`);
    const task = await buildConversation(conversation, options);
    if (task) return task;
  }

  console.error('[WorkerManage] Conversation not found in database or file storage:', id);
  return Promise.reject(new Error('Conversation not found'));
};

const kill = (id: string) => {
  const index = taskList.findIndex((item) => item.id === id);
  if (index === -1) return;
  const task = taskList[index];
  if (task) {
    task.task.kill();
  }
  taskList.splice(index, 1);
};

const clear = () => {
  taskList.forEach((item) => {
    item.task.kill();
  });
  taskList.length = 0;
};

const addTask = (id: string, task: AgentBaseTask<unknown>) => {
  const existing = taskList.find((item) => item.id === id);
  if (existing) {
    existing.task = task;
  } else {
    taskList.push({ id, task });
  }
};

const listTasks = () => {
  return taskList.map((t) => ({ id: t.id, type: t.task.type }));
};

const WorkerManage = {
  buildConversation,
  getTaskById,
  getTaskByIdRollbackBuild,
  addTask,
  listTasks,
  kill,
  clear,
};

export default WorkerManage;
