import React, { useState, useEffect } from 'react';
import {
  EducationLevel,
  ExplanationStyle,
  StaticLearnerProfileInputSchema,
} from '@mentora/shared';
import { useAppDispatch, useAppSelector } from '../../store/hooks.js';
import { closeProfileModal, addNotification } from '../../store/uiSlice.js';
import { updateProfileThunk } from '../../store/authSlice.js';

const EDUCATION_OPTIONS = [
  {
    value: EducationLevel.HIGH_SCHOOL,
    label: 'High School',
    desc: 'Foundational concepts, intuitive real-world examples, step-by-step guidance.',
  },
  {
    value: EducationLevel.UNDERGRADUATE,
    label: 'Undergraduate',
    desc: 'Rigorous derivations, academic models, analytical problem-solving.',
  },
  {
    value: EducationLevel.PROFESSIONAL,
    label: 'Professional',
    desc: 'System architecture, industry best practices, concrete real-world tradeoffs.',
  },
];

const STYLE_OPTIONS = [
  {
    value: ExplanationStyle.VISUAL,
    label: 'Visual & Structured',
    desc: 'Focus on architectural diagrams, flowcharts, and comparative tables.',
  },
  {
    value: ExplanationStyle.ANALOGY_HEAVY,
    label: 'Analogy-Heavy',
    desc: 'Everyday analogies and real-world metaphors before formal definitions.',
  },
  {
    value: ExplanationStyle.CONCISE_TECHNICAL,
    label: 'Concise & Technical',
    desc: 'Precise definitions, mathematical notation, code syntax, minimal filler.',
  },
];

export const ProfileSettingsModal: React.FC = () => {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const isProfileModalOpen = useAppSelector((state) => state.ui.isProfileModalOpen);

  const [educationLevel, setEducationLevel] = useState<EducationLevel>(
    user?.profile?.educationLevel ?? EducationLevel.UNDERGRADUATE
  );
  const [preferredStyle, setPreferredStyle] = useState<ExplanationStyle>(
    user?.profile?.preferredStyle ?? ExplanationStyle.VISUAL
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync state whenever modal opens or user profile changes
  useEffect(() => {
    if (user?.profile?.educationLevel) {
      setEducationLevel(user.profile.educationLevel);
    }
    if (user?.profile?.preferredStyle) {
      setPreferredStyle(user.profile.preferredStyle);
    }
    setErrorMsg(null);
  }, [user, isProfileModalOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isProfileModalOpen) {
        dispatch(closeProfileModal());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, isProfileModalOpen]);

  if (!isProfileModalOpen) {
    return null;
  }

  const handleClose = () => {
    dispatch(closeProfileModal());
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const validation = StaticLearnerProfileInputSchema.safeParse({
      educationLevel,
      preferredStyle,
    });

    if (!validation.success) {
      setErrorMsg('Please select valid profile settings.');
      return;
    }

    setIsSaving(true);
    try {
      const result = await dispatch(updateProfileThunk(validation.data));
      if (updateProfileThunk.fulfilled.match(result)) {
        dispatch(
          addNotification({
            type: 'success',
            message: 'Learner profile settings updated successfully.',
          })
        );
        handleClose();
      } else {
        setErrorMsg('Failed to update profile settings. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
      />

      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div className="relative transform overflow-hidden rounded-2xl bg-white text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg p-6 sm:p-8 border border-gray-200">
          <div className="flex items-center justify-between pb-4 border-b border-gray-100">
            <div>
              <h2 id="profile-modal-title" className="text-xl font-bold text-gray-900">
                Learner Profile Settings
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Update how Mentora personalizes explanations across all sessions
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 rounded-lg p-1 transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800"
            >
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSave} className="mt-5 space-y-6">
            {/* Education Level Field */}
            <div>
              <label
                htmlFor="education-select"
                className="block text-sm font-semibold text-gray-800 mb-1"
              >
                Education / Experience Level
              </label>
              <select
                id="education-select"
                value={educationLevel}
                onChange={(e) => setEducationLevel(e.target.value as EducationLevel)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg"
              >
                {EDUCATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {EDUCATION_OPTIONS.find((o) => o.value === educationLevel)?.desc}
              </p>
            </div>

            {/* Explanation Style Field */}
            <div>
              <label
                htmlFor="style-select"
                className="block text-sm font-semibold text-gray-800 mb-1"
              >
                Preferred Explanation Style
              </label>
              <select
                id="style-select"
                value={preferredStyle}
                onChange={(e) => setPreferredStyle(e.target.value as ExplanationStyle)}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-lg"
              >
                {STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {STYLE_OPTIONS.find((o) => o.value === preferredStyle)?.desc}
              </p>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 flex items-center justify-end space-x-3 border-t border-gray-100">
              <button
                type="button"
                onClick={handleClose}
                className="py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="py-2 px-5 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettingsModal;
