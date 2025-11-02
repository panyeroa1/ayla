// FIX: Removed invalid file header.
import React, { useEffect, useRef } from 'react';
import { ConversationTurn } from '../types';

interface CaptionsProps {
  conversation: ConversationTurn[];
}

export const Captions: React.FC<CaptionsProps> = ({ conversation }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation]);

  const getTurnClasses = (speaker: ConversationTurn['speaker']) => {
    switch (speaker) {
      case 'user':
        return 'justify-end';
      case 'model':
        return 'justify-start';
      case 'system':
        return 'justify-center';
      default:
        return 'justify-start';
    }
  };

  const getBubbleClasses = (speaker: ConversationTurn['speaker']) => {
     switch (speaker) {
      case 'user':
        return 'bg-blue-600 text-white';
      case 'model':
        return 'bg-gray-700 text-gray-200';
      case 'system':
        return 'bg-transparent text-gray-400 italic text-center text-xs';
      default:
        return 'bg-gray-700 text-gray-200';
    }
  }

  return (
    <div
      ref={scrollRef}
      className="absolute bottom-28 left-4 right-4 max-h-[30%] bg-black/60 backdrop-blur-sm rounded-lg p-4 overflow-y-auto pointer-events-auto"
    >
      <div className="flex flex-col space-y-2">
        {conversation.map((turn, index) => (
          <div key={`${turn.speaker}-${turn.timestamp}-${index}`} className={`flex ${getTurnClasses(turn.speaker)}`}>
            <div
              className={`max-w-xs md:max-w-md lg:max-w-lg rounded-xl px-4 py-2 ${getBubbleClasses(turn.speaker)}`}
            >
              <p className="text-sm">{turn.text}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};