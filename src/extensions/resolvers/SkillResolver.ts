/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skill Resolver
 * 将扩展的 ExtSkill 转换为内部 SkillDefinition
 *
 * @see RFC-002 Task 8
 */

import path from 'path';
import { existsSync } from 'fs';
import type { SkillDefinition } from '@/process/task/AcpSkillManager';
import type { ExtSkill, LoadedExtension } from '../types';

/**
 * Resolve extension skills into SkillDefinition objects.
 */
export function resolveSkills(extensions: LoadedExtension[]): SkillDefinition[] {
  const skills: SkillDefinition[] = [];

  for (const ext of extensions) {
    const declaredSkills = ext.manifest.contributes.skills;
    if (!declaredSkills || declaredSkills.length === 0) continue;

    for (const skill of declaredSkills) {
      const resolved = convertSkill(skill, ext);
      if (resolved) {
        skills.push(resolved);
      }
    }
  }

  return skills;
}

function convertSkill(skill: ExtSkill, ext: LoadedExtension): SkillDefinition | null {
  const absolutePath = path.resolve(ext.directory, skill.file);

  // Security: ensure path is within extension directory
  if (!absolutePath.startsWith(ext.directory)) {
    console.warn(`[Extensions] Skill file path traversal attempt: ${skill.file} in ${ext.manifest.name}`);
    return null;
  }

  if (!existsSync(absolutePath)) {
    console.warn(`[Extensions] Skill file not found: ${absolutePath} (extension: ${ext.manifest.name})`);
    return null;
  }

  return {
    name: skill.name,
    description: skill.description || `Skill from extension: ${ext.manifest.name}`,
    location: absolutePath,
  };
}
