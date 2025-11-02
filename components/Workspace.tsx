// FIX: Removed invalid file header.
import React, { useRef, FormEvent, useState, useEffect } from 'react';
// Fix: Import UploadAction type.
import { WorkspaceState, MediaAction, WorkspaceContent, ToolOutput, UploadAction } from '../types';
import { ToolOutputCard } from './ToolOutputCard';

interface WorkspaceProps {
  workspaceState: WorkspaceState;
  onActionSelect: (action: MediaAction) => void;
  onFileSelect: (file: File) => void;
  onRecordingComplete: (file: File) => void;
  onPromptSubmit: (prompt: string) => void;
  onClearWorkspace: () => void;
  onSelectApiKey: () => void;
  onRemoveToolOutput: (id: string) => void;
}

const LoadingSpinner: React.FC = () => (
  <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
  </svg>
);

const ActionSelector: React.FC<{ onSelect: (action: MediaAction) => void; onCancel: () => void }> = ({ onSelect, onCancel }) => {
  const actions: { id: MediaAction, title: string, description: string }[] = [
    { id: 'analyzeImage', title: 'Analyze Media', description: 'Upload an image or video for analysis.' },
    { id: 'editImage', title: 'Edit Image', description: 'Upload an image to edit with a prompt.' },
    { id: 'generateVideo', title: 'Generate Video', description: 'Use an image and prompt to create a video.' },
    { id: 'transcribeAudio', title: 'Transcribe File', description: 'Upload an audio or video file for transcription.' },
    { id: 'analyzeTradingData', title: 'Analyze Trading Data', description: 'Upload MT4/MT5 data for probability analysis.'},
    { id: 'recordMedia', title: 'Record Camera', description: 'Use your camera to record a new video clip.' },
    { id: 'recordScreen', title: 'Record Screen', description: 'Capture your screen with audio.' },
  ];

  return (
    <div className="flex flex-col items-center">
      <h3 className="text-xl font-semibold mb-4 text-center">Choose an Action</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
        {actions.map(action => (
          <button
            key={action.id}
            onClick={() => onSelect(action.id)}
            className="bg-neutral-800 hover:bg-neutral-700 p-4 rounded-lg text-left transition-colors"
          >
            <p className="font-semibold text-white">{action.title}</p>
            <p className="text-sm text-neutral-400">{action.description}</p>
          </button>
        ))}
      </div>
       <button onClick={onCancel} className="mt-6 text-sm text-gray-400 hover:text-white">Cancel</button>
    </div>
  );
};


const UploadBox: React.FC<{ onFileSelect: (file: File), uploadAction: WorkspaceState['uploadAction'] }> = ({ onFileSelect, uploadAction }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onFileSelect(event.target.files[0]);
    }
  };
  
  let acceptType = 'image/*,video/*';
  let title = 'Upload an Image or Video';
  let description = 'Select a media file to continue.';

  if (uploadAction === 'transcribeAudio') {
    acceptType = 'audio/*,video/*';
    title = 'Upload an Audio or Video File';
    description = 'Select a file to transcribe.';
  } else if (uploadAction === 'analyzeTradingData') {
    acceptType = '.csv,text/plain';
    title = 'Upload Trading Data';
    description = 'Select a .csv or .txt file with your trading history.';
  }

  return (
    <div className="text-center">
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 mb-4">{description}</p>
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept={acceptType} className="hidden" />
      <button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-md transition-colors">
        Choose File
      </button>
    </div>
  );
};

const RecordingView: React.FC<{ onRecordingComplete: (file: File) => void, onCancel: () => void }> = ({ onRecordingComplete, onCancel }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);

    const [status, setStatus] = useState<'idle' | 'permission' | 'recording' | 'finished'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
    
    useEffect(() => {
        let stream: MediaStream | null = null;
        const setup = async () => {
            try {
                setStatus('permission');
                stream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: {
                    noiseSuppression: true,
                    autoGainControl: true,
                    echoCancellation: true,
                  },
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(e => console.error("Autoplay failed:", e));
                }
                setStatus('idle');
            } catch (err) {
                console.error("Error accessing media devices.", err);
                setError("Could not access camera and microphone. Please check permissions.");
            }
        };
        setup();
        return () => {
            stream?.getTracks().forEach(track => track.stop());
        };
    }, []);

    const handleStartRecording = () => {
        if (!videoRef.current?.srcObject) return;
        recordedChunksRef.current = [];
        const stream = videoRef.current.srcObject as MediaStream;
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
        mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunksRef.current.push(event.data);
            }
        };
        mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            setRecordedVideoUrl(url);
            setStatus('finished');
        };
        mediaRecorderRef.current.start();
        setStatus('recording');
    };

    const handleStopRecording = () => {
        mediaRecorderRef.current?.stop();
    };
    
    const handleUseRecording = () => {
        if (!recordedVideoUrl) return;
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'video/webm' });
        onRecordingComplete(file);
    };

    if (error) {
        return <div className="text-center text-red-400">
            <p className="font-semibold">Permission Error</p>
            <p>{error}</p>
            <button onClick={onCancel} className="mt-4 text-sm text-gray-400 hover:text-white">Close</button>
        </div>
    }

    return (
        <div className="flex flex-col items-center">
            <h3 className="text-xl font-semibold mb-4">Record Camera</h3>
            <video ref={videoRef} muted className={`w-full max-w-md rounded-lg bg-black mb-4 ${status === 'finished' && 'hidden'}`} />
            {recordedVideoUrl && status === 'finished' && (
                <video src={recordedVideoUrl} controls autoPlay className="w-full max-w-md rounded-lg bg-black mb-4" />
            )}
            <div className="flex items-center gap-4">
                {status === 'idle' && <button onClick={handleStartRecording} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-6 rounded-md">Start Recording</button>}
                {status === 'recording' && <button onClick={handleStopRecording} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-md">Stop Recording</button>}
                {status === 'finished' && (
                    <>
                        <button onClick={() => setStatus('idle')} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-md">Record Again</button>
                        <button onClick={handleUseRecording} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-md">Use Recording</button>
                    </>
                )}
                <button onClick={onCancel} className="text-sm text-gray-400 hover:text-white">Cancel</button>
            </div>
        </div>
    )
};

const ScreenShareView: React.FC<{ onRecordingComplete: (file: File) => void, onCancel: () => void }> = ({ onRecordingComplete, onCancel }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordedChunksRef = useRef<Blob[]>([]);
    const combinedStreamRef = useRef<MediaStream | null>(null);

    const [status, setStatus] = useState<'permission' | 'idle' | 'recording' | 'finished'>('permission');
    const [error, setError] = useState<string | null>(null);
    const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);

    useEffect(() => {
        const setup = async () => {
            let screenStream: MediaStream | null = null;
            let audioStream: MediaStream | null = null;
            try {
                screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" } as any, audio: true });
                audioStream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                    noiseSuppression: true,
                    autoGainControl: true,
                    echoCancellation: true,
                  },
                });
                
                const combined = new MediaStream([
                    ...screenStream.getVideoTracks(),
                    ...screenStream.getAudioTracks(),
                    ...audioStream.getAudioTracks()
                ]);
                combinedStreamRef.current = combined;

                if (videoRef.current) {
                    videoRef.current.srcObject = combined;
                    videoRef.current.play().catch(console.error);
                }
                setStatus('idle');
                
                screenStream.getVideoTracks()[0].onended = () => {
                    if (mediaRecorderRef.current?.state === 'recording') {
                        mediaRecorderRef.current.stop();
                    }
                    if (status !== 'finished') onCancel();
                };
            } catch (err) {
                console.error("Error accessing screen share.", err);
                setError("Could not access screen sharing. Please check permissions and try again.");
                setStatus('idle');
            }
        };

        setup();
        return () => combinedStreamRef.current?.getTracks().forEach(track => track.stop());
    }, []);

    const handleStartRecording = () => {
        if (!combinedStreamRef.current) return;
        recordedChunksRef.current = [];
        mediaRecorderRef.current = new MediaRecorder(combinedStreamRef.current, { mimeType: 'video/webm' });
        mediaRecorderRef.current.ondataavailable = (event) => {
            if (event.data.size > 0) recordedChunksRef.current.push(event.data);
        };
        mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
            setRecordedVideoUrl(URL.createObjectURL(blob));
            setStatus('finished');
        };
        mediaRecorderRef.current.start();
        setStatus('recording');
    };

    const handleStopRecording = () => mediaRecorderRef.current?.stop();
    
    const handleUseRecording = () => {
        if (!recordedVideoUrl) return;
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const file = new File([blob], `screenshare-${Date.now()}.webm`, { type: 'video/webm' });
        onRecordingComplete(file);
    };

    if (error) {
        return <div className="text-center text-red-400">
            <p className="font-semibold">Permission Error</p>
            <p>{error}</p>
            <button onClick={onCancel} className="mt-4 text-sm text-gray-400 hover:text-white">Close</button>
        </div>;
    }

    return (
        <div className="flex flex-col items-center">
            <h3 className="text-xl font-semibold mb-4">Record Screen</h3>
            <video ref={videoRef} muted className={`w-full max-w-2xl rounded-lg bg-black mb-4 ${status === 'finished' && 'hidden'}`} />
            {recordedVideoUrl && status === 'finished' && (
                <video src={recordedVideoUrl} controls autoPlay className="w-full max-w-2xl rounded-lg bg-black mb-4" />
            )}
            <div className="flex items-center gap-4">
                {status === 'permission' && <p>Requesting permissions...</p>}
                {status === 'idle' && <button onClick={handleStartRecording} className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-6 rounded-md">Start Recording</button>}
                {status === 'recording' && <button onClick={handleStopRecording} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-md">Stop Recording</button>}
                {status === 'finished' && (
                    <>
                        <button onClick={onCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-6 rounded-md">Record Again</button>
                        <button onClick={handleUseRecording} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-md">Use Recording</button>
                    </>
                )}
                {status !== 'permission' && <button onClick={onCancel} className="text-sm text-gray-400 hover:text-white">Cancel</button>}
            </div>
        </div>
    );
};


const ResultViewer: React.FC<{ content: WorkspaceContent; uploadAction: UploadAction | undefined; onPromptSubmit: (prompt: string) => void; onClear: () => void }> = ({ content, uploadAction, onPromptSubmit, onClear }) => {
    const promptInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (promptInputRef.current?.value) {
            onPromptSubmit(promptInputRef.current.value);
            if (promptInputRef.current) promptInputRef.current.value = '';
        }
    };

    return (
        <div className="w-full flex flex-col items-center">
            {content.type === 'image' && <img src={content.data} alt="Generated content" className="max-w-full max-h-80 rounded-lg shadow-lg mb-4" />}
            {content.type === 'video' && <video src={content.data} controls autoPlay muted className="max-w-full max-h-80 rounded-lg shadow-lg mb-4" />}
            
            {content.type === 'code' && (
              <div className="bg-gray-900/80 p-4 rounded-lg text-left w-full max-h-60 overflow-y-auto mb-4 font-mono text-sm">
                <h4 className="font-semibold text-xs text-gray-400 mb-2 uppercase">{content.data.language}</h4>
                <pre className="whitespace-pre-wrap"><code>{content.data.text}</code></pre>
              </div>
            )}

            {(content.type === 'text' || content.type === 'grounding_search' || content.type === 'grounding_maps') && (
              <div className="bg-gray-900/80 p-4 rounded-lg text-left w-full max-h-60 overflow-y-auto mb-4">
                <p className="whitespace-pre-wrap">{content.data.text}</p>
                {content.data.sources && content.data.sources.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-gray-700">
                        <h4 className="font-semibold text-sm text-gray-400 mb-2">Sources:</h4>
                        <ul className="list-disc list-inside text-sm space-y-1">
                            {content.data.sources.map((source: any, i: number) => (
                                <li key={i}>
                                    <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">{source.title}</a>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
              </div>
            )}
            
            {uploadAction && (
                <form onSubmit={handleSubmit} className="w-full flex gap-2">
                    <input ref={promptInputRef} type="text" placeholder={`Prompt for ${uploadAction}...`} className="flex-grow bg-gray-800 border border-gray-700 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Submit</button>
                </form>
            )}

            <button onClick={onClear} className="mt-4 text-sm text-gray-400 hover:text-white">Clear</button>
        </div>
    );
};


export const Workspace: React.FC<WorkspaceProps> = ({ workspaceState, onActionSelect, onFileSelect, onPromptSubmit, onClearWorkspace, onSelectApiKey, onRecordingComplete, onRemoveToolOutput }) => {
  if (workspaceState.mode === 'idle') {
    return null;
  }
  
  const hasToolOutputs = workspaceState.toolOutputs.length > 0;

  const renderPrimaryContent = () => {
    switch (workspaceState.mode) {
      case 'action_select':
        return <ActionSelector onSelect={onActionSelect} onCancel={onClearWorkspace} />;
      case 'api_key_needed':
        return (
          <div className="text-center">
            <h3 className="text-xl font-semibold mb-2">API Key Required</h3>
            <p className="text-gray-400 mb-4 max-w-md">Video generation with Veo requires a dedicated API key with billing enabled. Please select your key to continue.</p>
            <p className="text-xs text-gray-500 mb-4">For more info, see the <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline">billing documentation</a>.</p>
            <button onClick={onSelectApiKey} className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-6 rounded-md transition-colors">
              Select API Key
            </button>
          </div>
        );
      case 'upload':
        return <UploadBox onFileSelect={onFileSelect} uploadAction={workspaceState.uploadAction} />;
      case 'recording':
        return <RecordingView onRecordingComplete={onRecordingComplete} onCancel={onClearWorkspace} />;
      case 'screen_sharing_setup':
        return <ScreenShareView onRecordingComplete={onRecordingComplete} onCancel={onClearWorkspace} />;
      case 'processing':
        return (
          <div className="flex flex-col items-center space-y-3">
            <LoadingSpinner />
            <p className="font-medium text-lg">{workspaceState.message || 'Processing...'}</p>
          </div>
        );
      case 'result':
        if (workspaceState.primaryContent) {
            return <ResultViewer content={workspaceState.primaryContent} uploadAction={workspaceState.uploadAction} onPromptSubmit={onPromptSubmit} onClear={onClearWorkspace} />;
        }
        // If there are tool outputs but no primary content, show a placeholder or nothing in the main area
        if (hasToolOutputs) {
            return <div className="text-center text-neutral-500">Select an action or use your voice to interact with a tool.</div>;
        }
        return null;
      default:
        return null;
    }
  };

  const primaryContent = renderPrimaryContent();

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 p-4">
        <div className={`bg-black/70 backdrop-blur-md border border-white/10 rounded-xl p-6 text-white pointer-events-auto shadow-2xl max-h-[85vh] overflow-hidden animate-fade-in-tool flex gap-6 ${hasToolOutputs ? 'max-w-6xl' : 'max-w-3xl'}`}>
            {/* Primary Content Area */}
            {primaryContent && (
                <div className="flex-1 overflow-y-auto pr-2">
                    {primaryContent}
                </div>
            )}

            {/* Tool Outputs Sidebar */}
            {hasToolOutputs && (
                <div className="w-1/3 min-w-[300px] border-l border-white/10 pl-6 flex flex-col">
                    <h3 className="text-lg font-semibold mb-4 text-center">Tool Outputs</h3>
                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                        {workspaceState.toolOutputs.map(output => (
                           <ToolOutputCard key={output.id} output={output} onRemove={onRemoveToolOutput} />
                        ))}
                    </div>
                </div>
            )}
        </div>
      <style>{`
        .animate-fade-in-tool {
          animation: fadeInTool 0.4s ease-in-out;
        }
        @keyframes fadeInTool {
          from { opacity: 0; transform: translateY(15px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-slide-in {
            animation: slideIn 0.3s ease-out;
        }
        @keyframes slideIn {
            from { opacity: 0; transform: translateX(10px); }
            to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};