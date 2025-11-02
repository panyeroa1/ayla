// FIX: Removed invalid file header.
import React from 'react';
import { MicrophoneIcon, SparklesIcon, HandThumbUpIcon, XMarkIcon, ArrowUturnRightIcon } from './icons';

interface ControlBarProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  onHangUp: () => void;
  onShowActions: () => void;
  onOpenFeedback: () => void;
  onSkipTurn: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isRecording,
  onToggleRecording,
  onHangUp,
  onShowActions,
  onOpenFeedback,
  onSkipTurn,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 pb-8 flex justify-center items-center z-20">
      <div className="flex items-center space-x-4 md:space-x-6">
        {/* Actions Button */}
        <button
          onClick={onShowActions}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center"
          aria-label="Show Actions"
        >
          <SparklesIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>

        {/* Microphone Button */}
        <button
          onClick={onToggleRecording}
          className={`w-14 h-14 md:w-16 md:h-16 rounded-full transition-colors flex items-center justify-center ${isRecording ? 'bg-blue-600 hover:bg-blue-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}
          aria-label={isRecording ? 'Microphone is on' : 'Turn on microphone'}
        >
          <MicrophoneIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>

        {/* Feedback Button */}
        <button
          onClick={onOpenFeedback}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center"
          aria-label="Send Feedback"
        >
          <HandThumbUpIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>
        
        {/* Skip Turn Button */}
        <button
          onClick={onSkipTurn}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center"
          aria-label="Skip Turn"
        >
          <ArrowUturnRightIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>

        {/* Hang Up Button */}
        <button
          onClick={onHangUp}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center"
          aria-label="Hang Up"
        >
          <XMarkIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>
      </div>
    </div>
  );
};
