// FIX: Removed invalid file header.
import React from 'react';
import { ToolOutput } from '../types';
import { XMarkIcon, SparklesIcon } from './icons';

interface ToolOutputCardProps {
  output: ToolOutput;
  onRemove: (id: string) => void;
}

const renderContent = (content: ToolOutput['content']) => {
  switch (content.type) {
    case 'image':
      return <img src={content.data} alt={content.prompt || 'Generated Image'} className="rounded-md w-full object-contain max-h-60" />;
    case 'video':
       return <video src={content.data} controls muted className="rounded-md w-full object-contain max-h-60" />;
    case 'text':
      return <p className="text-sm text-neutral-300 whitespace-pre-wrap">{content.data.text}</p>;
    case 'code':
      return (
        <div className="bg-black/50 p-2 rounded-md font-mono text-xs">
           <h4 className="font-semibold text-xs text-gray-400 mb-1 uppercase">{content.data.language}</h4>
           <pre className="whitespace-pre-wrap"><code>{content.data.text}</code></pre>
        </div>
      );
    default:
      return <p className="text-xs text-red-400">Unsupported content type</p>;
  }
};

export const ToolOutputCard: React.FC<ToolOutputCardProps> = ({ output, onRemove }) => {
  const { id, toolName, content } = output;

  // Create a more readable title from the camelCase toolName
  const title = toolName.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());

  return (
    <div className="bg-neutral-800/60 border border-neutral-700 rounded-lg overflow-hidden animate-slide-in">
      <div className="flex justify-between items-center p-2 bg-neutral-900/40 border-b border-neutral-700">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-blue-400" />
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <button onClick={() => onRemove(id)} className="p-1 text-neutral-500 hover:text-white hover:bg-neutral-700 rounded-full">
          <XMarkIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3">
        {content.prompt && <p className="text-xs text-neutral-400 italic mb-2">"{content.prompt}"</p>}
        {renderContent(content)}
      </div>
    </div>
  );
};