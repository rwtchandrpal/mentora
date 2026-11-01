import { LearningMode } from '@mentora/shared';

export interface ModeColorConfig {
  mode: LearningMode;
  name: string;
  tabActive: string;
  tabInactive: string;
  cardSelected: string;
  cardUnselected: string;
  radioSelected: string;
  radioUnselected: string;
  badge: string;
}

export const MODE_THEMES: Record<LearningMode, ModeColorConfig> = {
  [LearningMode.EXPLAIN]: {
    mode: LearningMode.EXPLAIN,
    name: 'Explain Mode',
    tabActive: 'bg-white text-blue-800 shadow-sm border border-blue-200/80 ring-1 ring-blue-500/20',
    tabInactive: 'text-gray-700 hover:text-blue-800 hover:bg-blue-50/60',
    cardSelected: 'border-blue-600 bg-blue-50/60 shadow-xs text-blue-950',
    cardUnselected: 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/20 bg-white text-gray-900',
    radioSelected: 'border-blue-600 bg-blue-600',
    radioUnselected: 'border-gray-300',
    badge: 'bg-blue-50 text-blue-800 border-blue-200',
  },
  [LearningMode.INTERACT]: {
    mode: LearningMode.INTERACT,
    name: 'Interact Mode',
    tabActive: 'bg-white text-emerald-800 shadow-sm border border-emerald-200/80 ring-1 ring-emerald-500/20',
    tabInactive: 'text-gray-700 hover:text-emerald-800 hover:bg-emerald-50/60',
    cardSelected: 'border-emerald-600 bg-emerald-50/60 shadow-xs text-emerald-950',
    cardUnselected: 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50/20 bg-white text-gray-900',
    radioSelected: 'border-emerald-600 bg-emerald-600',
    radioUnselected: 'border-gray-300',
    badge: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  [LearningMode.PRACTICE]: {
    mode: LearningMode.PRACTICE,
    name: 'Practice Mode',
    tabActive: 'bg-white text-violet-800 shadow-sm border border-violet-200/80 ring-1 ring-violet-500/20',
    tabInactive: 'text-gray-700 hover:text-violet-800 hover:bg-violet-50/60',
    cardSelected: 'border-violet-600 bg-violet-50/60 shadow-xs text-violet-950',
    cardUnselected: 'border-gray-200 hover:border-violet-300 hover:bg-violet-50/20 bg-white text-gray-900',
    radioSelected: 'border-violet-600 bg-violet-600',
    radioUnselected: 'border-gray-300',
    badge: 'bg-violet-50 text-violet-800 border-violet-200',
  },
};

export const getModeTabClasses = (mode: LearningMode, isActive: boolean): string => {
  const theme = MODE_THEMES[mode];
  return isActive ? theme.tabActive : theme.tabInactive;
};

export const getModeCardClasses = (mode: LearningMode, isSelected: boolean): string => {
  const theme = MODE_THEMES[mode];
  return isSelected ? theme.cardSelected : theme.cardUnselected;
};

export const getModeRadioClasses = (mode: LearningMode, isSelected: boolean): string => {
  const theme = MODE_THEMES[mode];
  return isSelected ? theme.radioSelected : theme.radioUnselected;
};

export const getModeBadgeClasses = (mode: LearningMode): string => {
  return MODE_THEMES[mode]?.badge ?? 'bg-gray-50 text-gray-700 border-gray-200';
};
