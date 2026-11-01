import React from 'react';

export interface SidebarToggleButtonProps {
  isSidebarOpen: boolean;
  onClick: () => void;
  className?: string;
}

export const SidebarToggleButton: React.FC<SidebarToggleButtonProps> = ({
  isSidebarOpen,
  onClick,
  className = '',
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors border-0 border-transparent outline-none ring-0 hover:border-transparent hover:outline-none hover:ring-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${className}`}
      aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      aria-expanded={isSidebarOpen}
      title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
    >
      <svg
        className="w-5 h-5 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        {isSidebarOpen ? (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 19l-7-7 7-7"
          />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M9 5l7 7-7 7"
          />
        )}
      </svg>
    </button>
  );
};

export default SidebarToggleButton;
