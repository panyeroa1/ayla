// FIX: Removed invalid file header.
import React from 'react';
import {
  MicrophoneIcon,
  VideoCameraIcon,
  ComputerDesktopIcon,
  RecordIcon,
  PhoneHangUpIcon,
} from './icons';

interface ControlBarProps {
  isRecording: boolean;
  onToggleRecording: () => void;
  onHangUp: () => void; // For 'Call' button (hang up)
  onShowActions: () => void; // For 'Record' button (more actions)
  onRecordCamera: () => void; // For 'Video' button
  onRecordScreen: () => void; // For 'Share Screen' button
}

export const ControlBar: React.FC<ControlBarProps> = ({
  isRecording,
  onToggleRecording,
  onHangUp,
  onShowActions,
  onRecordCamera,
  onRecordScreen,
}) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 pb-8 flex justify-center items-center z-20">
      <div className="flex items-center space-x-4 md:space-x-6">
        {/* Microphone Button */}
        <button
          onClick={onToggleRecording}
          className={`w-14 h-14 md:w-16 md:h-16 rounded-full transition-colors flex items-center justify-center ${
            isRecording ? 'bg-blue-600 hover:bg-blue-700' : 'bg-neutral-800 hover:bg-neutral-700'
          }`}
          aria-label={isRecording ? 'Microphone is on' : 'Turn on microphone'}
        >
          <MicrophoneIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>

        {/* Video Button */}
        <button
          onClick={onRecordCamera}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center"
          aria-label="Record Video"
        >
          <VideoCameraIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>

        {/* Share Screen Button */}
        <button
          onClick={onRecordScreen}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center"
          aria-label="Share Screen"
        >
          <ComputerDesktopIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>

        {/* Record Button (for more actions) */}
        <button
          onClick={onShowActions}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center justify-center"
          aria-label="More Actions"
        >
          <RecordIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>

        {/* Call Button (hang up) */}
        <button
          onClick={onHangUp}
          className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-600 hover:bg-red-700 transition-colors flex items-center justify-center"
          aria-label="Hang Up"
        >
          <PhoneHangUpIcon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </button>
      </div>
    </div>
  );
};
