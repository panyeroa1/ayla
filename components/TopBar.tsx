// FIX: Removed invalid file header.
import React from 'react';
import { CCIcon, SpeakerWaveIcon, AdjustmentsHorizontalIcon, PhoneIcon } from './icons';

interface TopBarProps {
  onOpenSettings: () => void;
  onToggleCaptions: () => void;
  isCaptionsOn: boolean;
  onNavigateToDialer: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onOpenSettings, onToggleCaptions, isCaptionsOn, onNavigateToDialer }) => {
  return (
    <div className="fixed top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/50 to-transparent">
      <button
        onClick={onNavigateToDialer}
        className="text-gray-300 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
        aria-label="Open Dialer"
      >
        <PhoneIcon className="w-6 h-6" />
      </button>

      <div className="flex items-center space-x-2">
        <button
          onClick={onToggleCaptions}
          className={`p-2 rounded-full transition-colors ${isCaptionsOn ? 'bg-white/20 text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'}`}
          aria-label={isCaptionsOn ? 'Hide Captions' : 'Show Captions'}
        >
          <CCIcon className="w-6 h-6" />
        </button>
        <button
          className="text-gray-300 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
          aria-label="Volume"
        >
          <SpeakerWaveIcon className="w-6 h-6" />
        </button>
        <button
          onClick={onOpenSettings}
          className="text-gray-300 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10"
          aria-label="Open Settings"
        >
          <AdjustmentsHorizontalIcon className="w-6 h-6" />
        </button>
      </div>
    </div>
  );
};