// FIX: Removed invalid file headers.
import React, { useState, useEffect, useRef, useCallback } from 'react';
// FIX: The type `LiveSession` is not an exported member of `@google/genai`.
import { LiveServerMessage, Modality, Blob as GenaiBlob } from '@google/genai';

// Components
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { TopBar } from './components/TopBar';
import { ControlBar } from './components/ControlBar';
import { Captions } from './components/Captions';
import { Settings } from './components/Settings';
import { Feedback } from './components/Feedback';
import { Workspace } from './components/Workspace';
import * as Icons from './components/icons';


// Types
import {
  AppSettings, ConversationTurn, WorkspaceState, ActiveToolCall, WorkspaceContent,
  MediaAction, UploadAction, ToolOutput, CallState, CallTranscriptEntry,
  CallHistoryEntry, CallType, Contact,
} from './types';

// Services & Utils
import * as geminiService from './services/geminiService';
import * as subAgentService from './services/subAgentService';
import { decode, decodeAudioData, encode } from './services/audioUtils';

// --- Dialer Audio Service (Simplified) ---
class DialerAudioService {
    private audioCtx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private ringOsc1: OscillatorNode | null = null;
    private ringOsc2: OscillatorNode | null = null;
    private ringGain: GainNode | null = null;
    private ringInterval: number | null = null;
    private holdMusicInterval: number | null = null;
    private holdMusicGain: GainNode | null = null;

    private init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.connect(this.audioCtx.destination);
        }
        this.audioCtx.resume();
    }
    
    startRinging() {
        this.init();
        if (!this.audioCtx || !this.masterGain) return;

        this.ringGain = this.audioCtx.createGain();
        this.ringGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        this.ringGain.connect(this.masterGain);

        this.ringOsc1 = this.audioCtx.createOscillator();
        this.ringOsc1.type = 'sine';
        this.ringOsc1.frequency.setValueAtTime(440, this.audioCtx.currentTime);
        this.ringOsc1.connect(this.ringGain);
        this.ringOsc1.start();

        this.ringOsc2 = this.audioCtx.createOscillator();
        this.ringOsc2.type = 'sine';
        this.ringOsc2.frequency.setValueAtTime(480, this.audioCtx.currentTime);
        this.ringOsc2.connect(this.ringGain);
        this.ringOsc2.start();

        const ring = () => {
            if (!this.audioCtx || !this.ringGain) return;
            const now = this.audioCtx.currentTime;
            this.ringGain.gain.setValueAtTime(0.3, now);
            this.ringGain.gain.setValueAtTime(0, now + 2);
        };
        ring();
        this.ringInterval = window.setInterval(ring, 6000);
    }

    stopRinging() {
        if (this.ringInterval) clearInterval(this.ringInterval);
        this.ringInterval = null;
        if(this.ringGain) this.ringGain.gain.cancelScheduledValues(0);
        this.ringOsc1?.stop();
        this.ringOsc2?.stop();
        this.ringOsc1 = this.ringOsc2 = this.ringGain = null;
    }
    
    playDTMF(key: string) {
        this.init();
        if (!this.audioCtx || !this.masterGain) return;
        const frequencies: { [key: string]: [number, number] } = {
            '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
            '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
            '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
            '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
        };
        if (!frequencies[key]) return;

        const [freq1, freq2] = frequencies[key];
        const gain = this.audioCtx.createGain();
        gain.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gain.connect(this.masterGain);

        const osc1 = this.audioCtx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = freq1;
        osc1.connect(gain);
        osc1.start();

        const osc2 = this.audioCtx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq2;
        osc2.connect(gain);
        osc2.start();

        setTimeout(() => {
            osc1.stop();
            osc2.stop();
            gain.disconnect();
        }, 200);
    }
    
    startHoldMusic() {
        this.init();
        if (!this.audioCtx || !this.masterGain || this.holdMusicInterval) return;
        
        this.holdMusicGain = this.audioCtx.createGain();
        this.holdMusicGain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
        this.holdMusicGain.connect(this.masterGain);

        const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
        let noteIndex = 0;
        
        const playNote = () => {
            if (!this.audioCtx || !this.holdMusicGain) return;
            const osc = this.audioCtx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(notes[noteIndex % notes.length], this.audioCtx.currentTime);
            osc.connect(this.holdMusicGain);
            osc.start();
            osc.stop(this.audioCtx.currentTime + 0.4);
            noteIndex++;
        };
        
        this.holdMusicInterval = window.setInterval(playNote, 500);
    }
    
    stopHoldMusic() {
        if(this.holdMusicInterval) clearInterval(this.holdMusicInterval);
        this.holdMusicInterval = null;
        this.holdMusicGain?.disconnect();
        this.holdMusicGain = null;
    }
    
    stopAll() {
        this.stopRinging();
        this.stopHoldMusic();
        this.audioCtx?.close().then(() => this.audioCtx = null);
    }
}

const MOCK_CONTACTS_INIT: Contact[] = [
    { id: 'contact-1', firstName: 'Jhon', lastName: 'Doe', number: '555-123-4567' },
    { id: 'contact-2', firstName: 'Alice', lastName: 'Smith', number: '555-222-3333' },
];

const MOCK_CALL_HISTORY: CallHistoryEntry[] = [
    { id: '1', contactName: 'Jhon Doe', number: '555-123-4567', type: 'outgoing', timestamp: Date.now() - 86400000 * 1 + 3600000, duration: 125 },
    { id: '2', contactName: 'Work', number: '555-987-6543', type: 'missed', timestamp: Date.now() - 3600000 * 3, duration: 0 },
    { id: '3', contactName: 'Alice Smith', number: '555-222-3333', type: 'incoming', timestamp: Date.now() - 3600000 * 5, duration: 480 },
    { id: '4', contactName: 'Unknown', number: '555-888-9999', type: 'missed', timestamp: Date.now() - 86400000, duration: 0 },
];

const MOCK_FAVORITES = [
    { id: 'fav1', name: 'Home', number: '555-111-2222' },
    { id: 'fav2', name: 'Mom', number: '555-333-4444' },
    { id: 'fav3', name: 'Work', number: '555-987-6543' },
    { id: 'fav4', name: 'Alice Smith', number: '555-222-3333' },
    { id: 'fav5', name: 'Dr. Evans', number: '555-555-5555' },
];

type DialerTab = 'favorites' | 'recents' | 'contacts' | 'keypad' | 'voicemail';

// --- Dialer Page & Components ---
const DialerPage: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    const [callState, setCallState] = useState<CallState>('keypad');
    const [dialedNumber, setDialedNumber] = useState('');
    const [callDuration, setCallDuration] = useState(0);
    const audioServiceRef = useRef<DialerAudioService | null>(null);
    const timerRef = useRef<number | null>(null);
    const [showInCallKeypad, setShowInCallKeypad] = useState(false);
    const [activeTab, setActiveTab] = useState<DialerTab>('keypad');
    const [callHistory, setCallHistory] = useState<CallHistoryEntry[]>(MOCK_CALL_HISTORY);
    const [contacts, setContacts] = useState<Contact[]>(MOCK_CONTACTS_INIT);
    const [showAddContact, setShowAddContact] = useState(false);
    const [numberToSave, setNumberToSave] = useState('');

    const findContactByNumber = (number: string) => contacts.find(c => c.number === number);
    
    useEffect(() => {
        audioServiceRef.current = new DialerAudioService();
        return () => {
            audioServiceRef.current?.stopAll();
            if(timerRef.current) clearInterval(timerRef.current);
        }
    }, []);

    const startTimer = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = window.setInterval(() => setCallDuration(d => d + 1), 1000);
    };

    const handleStateChange = (newState: CallState, numberToCall?: string) => {
        const currentState = callState;
        if (numberToCall) setDialedNumber(numberToCall);
        
        // State Exit Logic
        if(currentState === 'ringing') audioServiceRef.current?.stopRinging();
        if(currentState === 'on-hold') audioServiceRef.current?.stopHoldMusic();
        if (currentState === 'connected' || currentState === 'ringing' || currentState === 'on-hold') {
             const finalNumber = numberToCall || dialedNumber;
             const contact = findContactByNumber(finalNumber);
             setCallHistory(prev => [{
                id: `call-${Date.now()}`,
                contactName: contact ? `${contact.firstName} ${contact.lastName}` : (finalNumber === '1-800-874-8875' ? 'Turkish Airlines' : 'Unknown'),
                number: finalNumber,
                type: 'outgoing',
                timestamp: Date.now(),
                duration: callDuration,
            }, ...prev]);

            if (!contact && finalNumber !== '1-800-874-8875') {
                setNumberToSave(finalNumber);
                setCallState('summary');
                return;
            }
        }

        setCallState(newState);

        // State Enter Logic
        switch(newState) {
            case 'ringing':
                audioServiceRef.current?.startRinging();
                setTimeout(() => handleStateChange('connected', numberToCall || dialedNumber), 7000);
                break;
            case 'connected':
                setCallDuration(0);
                startTimer();
                break;
            case 'on-hold':
                audioServiceRef.current?.startHoldMusic();
                break;
            case 'keypad':
                if (timerRef.current) clearInterval(timerRef.current);
                setDialedNumber('');
                setCallDuration(0);
                audioServiceRef.current?.stopAll();
                break;
        }
    };
    
    const handleKeypadPress = (key: string) => {
        audioServiceRef.current?.playDTMF(key);
        if (callState === 'keypad' || (callState === 'connected' && showInCallKeypad)) {
            setDialedNumber(prev => prev + key);
        }
    };

    const handleSaveContact = (newContact: Omit<Contact, 'id'>) => {
        const fullContact = { ...newContact, id: `contact-${Date.now()}`};
        setContacts(prev => [fullContact, ...prev]);
        setShowAddContact(false);
        setNumberToSave('');
        // If we were in summary, go back to keypad
        if(callState === 'summary') handleStateChange('keypad');
    };
    
    const handleCall = () => handleStateChange('ringing', dialedNumber || '1-800-874-8875'); // Default to Turkish Airlines for demo
    const handleEndCall = () => handleStateChange('keypad');

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const renderContent = () => {
        if(showAddContact) return <AddContactView onCancel={() => setShowAddContact(false)} onSave={handleSaveContact} initialNumber={numberToSave} />;
        
        switch (callState) {
            case 'keypad': return <DialpadView number={dialedNumber} onKeyPress={handleKeypadPress} onClear={() => setDialedNumber(d => d.slice(0, -1))} onCall={handleCall} activeTab={activeTab} setActiveTab={setActiveTab} callHistory={callHistory} onRedial={(num) => handleStateChange('ringing', num)} contacts={contacts} onAddContact={() => { setNumberToSave(''); setShowAddContact(true); }} />;
            case 'ringing': return <CallingView onEndCall={handleEndCall} />;
            case 'connected': 
            case 'on-hold':
                return <InCallView
                    contactName={findContactByNumber(dialedNumber)?.firstName || 'Jhon Doe'}
                    number={dialedNumber}
                    duration={formatDuration(callDuration)}
                    onEndCall={handleEndCall}
                    onHold={() => handleStateChange(callState === 'on-hold' ? 'connected' : 'on-hold')}
                    isOnHold={callState === 'on-hold'}
                    showKeypad={showInCallKeypad}
                    onToggleKeypad={() => setShowInCallKeypad(p => !p)}
                    onKeyPress={handleKeypadPress}
                />;
            case 'summary': return <SummaryView duration={formatDuration(callDuration)} number={numberToSave} onAddContact={() => setShowAddContact(true)} onClose={handleEndCall} />;
            default: return null;
        }
    };

    return (
        <div className="absolute inset-0 bg-gradient-to-b from-blue-900 via-slate-900 to-black text-white flex flex-col z-50 animate-fade-in-tool font-sans">
           <div className="relative w-full h-full max-w-sm mx-auto flex flex-col">
              {renderContent()}
           </div>
        </div>
    );
};

const Keypad: React.FC<{ onKeyPress: (key: string) => void }> = ({ onKeyPress }) => {
    const keys = "123456789*0#".split('');
    const letters = ["", "ABC", "DEF", "GHI", "JKL", "MNO", "PQRS", "TUV", "WXYZ"];
    return (
        <div className="grid grid-cols-3 gap-y-4 gap-x-6 w-full">
            {keys.map((k, i) => {
                const letter = (k >= '2' && k <= '9') ? letters[parseInt(k, 10) - 1] : (k === '0' ? '+' : ' ');
                return (
                    <button key={k} onClick={() => onKeyPress(k)} className="flex flex-col items-center justify-center h-[72px] rounded-full bg-white/10 active:bg-white/20 transition-all duration-100 transform active:scale-95">
                        <span className="text-3xl font-light">{k}</span>
                        {k !== '*' && k !== '#' && <span className="text-xs text-gray-400 tracking-widest">{letter}</span>}
                    </button>
                );
            })}
        </div>
    );
};

const RecentsView: React.FC<{ history: CallHistoryEntry[], onRedial: (number: string) => void }> = ({ history, onRedial }) => {
    const formatTimestamp = (ts: number) => {
        const date = new Date(ts);
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return `Today, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        if (date.toDateString() === yesterday.toDateString()) {
            return `Yesterday, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        return date.toLocaleDateString();
    };

    const CallTypeIcon: React.FC<{ type: CallType }> = ({ type }) => {
        if (type === 'outgoing') return <Icons.PhoneArrowUpRightIcon className="w-4 h-4 text-gray-400" />;
        if (type === 'incoming') return <Icons.PhoneArrowDownLeftIcon className="w-4 h-4 text-green-400" />;
        if (type === 'missed') return <Icons.PhoneIcon className="w-4 h-4 text-red-500" />; // Simplified missed icon
        return null;
    };
    
    return (
      <div className="flex-grow flex flex-col w-full overflow-y-auto">
        <h2 className="text-3xl font-semibold p-4">Recents</h2>
        <ul className="flex-grow divide-y divide-white/10">
            {history.map(call => (
                <li key={call.id} className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer" onClick={() => onRedial(call.number)}>
                    <div className="flex items-center gap-4">
                        <CallTypeIcon type={call.type} />
                        <div>
                            <p className={`font-semibold ${call.type === 'missed' ? 'text-red-400' : 'text-white'}`}>{call.contactName}</p>
                            <p className="text-sm text-gray-400">{call.number}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">{formatTimestamp(call.timestamp)}</span>
                        <button onClick={(e) => {e.stopPropagation(); alert(`Details for ${call.contactName}`)}} className="text-blue-400">
                            <Icons.InformationCircleIcon className="w-6 h-6"/>
                        </button>
                    </div>
                </li>
            ))}
        </ul>
      </div>
    );
};

const FavoritesView: React.FC<{ onCall: (number: string) => void }> = ({ onCall }) => {
    return (
        <div className="flex-grow flex flex-col w-full overflow-y-auto">
            <h2 className="text-3xl font-semibold p-4">Favorites</h2>
            <div className="grid grid-cols-3 gap-4 px-4">
                {MOCK_FAVORITES.map(fav => (
                    <button key={fav.id} onClick={() => onCall(fav.number)} className="flex flex-col items-center justify-center gap-2 p-2 rounded-lg hover:bg-white/10 transition-colors">
                        <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center">
                            <Icons.UserCircleIcon className="w-10 h-10 text-gray-400" />
                        </div>
                        <span className="text-sm font-medium truncate">{fav.name}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

const ContactsView: React.FC<{ contacts: Contact[], onCall: (number: string) => void, onAddContact: () => void }> = ({ contacts, onCall, onAddContact }) => {
    return (
        <div className="flex-grow flex flex-col w-full">
            <header className="flex justify-between items-center p-4">
                <h2 className="text-3xl font-semibold">Contacts</h2>
                <button onClick={onAddContact} className="p-2 rounded-full text-blue-400 hover:bg-white/10">
                    <Icons.UserPlusIcon className="w-6 h-6" />
                </button>
            </header>
            <ul className="flex-grow divide-y divide-white/10 overflow-y-auto">
                {contacts.map(contact => (
                    <li key={contact.id} onClick={() => onCall(contact.number)} className="flex items-center gap-4 p-4 hover:bg-white/5 cursor-pointer">
                        <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                            <Icons.UserCircleIcon className="w-8 h-8 text-gray-400" />
                        </div>
                        <div>
                            <p className="font-semibold">{contact.firstName} {contact.lastName}</p>
                            <p className="text-sm text-gray-400">{contact.number}</p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const AddContactView: React.FC<{ onCancel: () => void; onSave: (contact: Omit<Contact, 'id'>) => void; initialNumber?: string; }> = ({ onCancel, onSave, initialNumber = '' }) => {
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [number, setNumber] = useState(initialNumber);

    const handleSave = () => {
        if (firstName && number) {
            onSave({ firstName, lastName, number });
        }
    };

    return (
        <div className="w-full h-full flex flex-col">
            <header className="flex justify-between items-center p-4">
                <button onClick={onCancel} className="text-blue-400 text-lg">Cancel</button>
                <h2 className="text-lg font-semibold">New Contact</h2>
                <button onClick={handleSave} disabled={!firstName || !number} className="text-blue-400 text-lg font-bold disabled:text-gray-600">
                    Save
                </button>
            </header>
            <main className="flex-grow flex flex-col items-center pt-8 px-4 gap-6">
                <div className="w-32 h-32 bg-white/10 rounded-full flex items-center justify-center">
                    <Icons.UserCircleIcon className="w-24 h-24 text-gray-500" />
                </div>
                <div className="w-full space-y-2">
                    <input type="text" placeholder="First Name" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full p-3 bg-white/10 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="text" placeholder="Last Name" value={lastName} onChange={e => setLastName(e.target.value)} className="w-full p-3 bg-white/10 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="tel" placeholder="Phone Number" value={number} onChange={e => setNumber(e.target.value)} className="w-full p-3 bg-white/10 rounded-lg placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
            </main>
        </div>
    );
};

const SummaryView: React.FC<{ duration: string, number: string, onAddContact: () => void, onClose: () => void }> = ({ duration, number, onAddContact, onClose }) => {
    return (
        <div className="w-full h-full flex flex-col justify-center items-center text-center gap-6 p-4">
            <Icons.CheckIcon className="w-20 h-20 text-green-400 bg-green-400/20 rounded-full p-4" />
            <div>
                <h2 className="text-3xl font-semibold">Call Ended</h2>
                <p className="text-gray-400">Duration: {duration}</p>
            </div>
            <div className="w-full max-w-xs space-y-4">
                <button onClick={onAddContact} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-colors">
                    Add to Contacts
                </button>
                <button onClick={onClose} className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-colors">
                    Done
                </button>
            </div>
        </div>
    );
};

const PlaceholderView: React.FC<{ title: string }> = ({ title }) => (
    <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-500">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p>This feature is not yet implemented.</p>
    </div>
);

const DialpadView: React.FC<{
    number: string; onKeyPress: (k: string) => void; onClear: () => void; onCall: () => void;
    activeTab: DialerTab; setActiveTab: (tab: DialerTab) => void;
    callHistory: CallHistoryEntry[]; onRedial: (number: string) => void;
    contacts: Contact[]; onAddContact: () => void;
}> = ({number, onKeyPress, onClear, onCall, activeTab, setActiveTab, callHistory, onRedial, contacts, onAddContact}) => {
    
    const FooterButton: React.FC<{label: string, icon: React.FC<any>, name: DialerTab}> = ({label, icon: Icon, name}) => {
        const isActive = activeTab === name;
        return (
            <button onClick={() => setActiveTab(name)} className={`flex flex-col items-center text-xs gap-1 ${isActive ? 'text-blue-400' : 'text-gray-400'}`}>
                <Icon className="w-6 h-6"/>{label}
            </button>
        )
    };

    return (
        <>
            <header className="flex justify-between items-center px-4 pt-4">
                <span className="text-sm font-medium">Mobile</span>
                <div className="flex items-center gap-4 text-gray-300">
                    <Icons.SearchIcon className="w-5 h-5" />
                    <Icons.EllipsisVerticalIcon className="w-5 h-5" />
                </div>
            </header>
            
            <main className="flex-grow flex flex-col justify-end items-center px-6 overflow-hidden">
                {activeTab === 'keypad' && (
                    <>
                        <div className="relative flex items-center justify-center w-full mb-4 h-16">
                            <span className="text-4xl text-center truncate">
                                {number || <span className="text-gray-600">Enter Number</span>}
                            </span>
                            {number && (
                                <button onClick={onClear} className="absolute right-0 p-2 text-gray-400 hover:text-white rounded-full hover:bg-white/10 transition-colors">
                                    <span className="sr-only">Delete</span>
                                    <Icons.XMarkIcon className="w-7 h-7" />
                                </button>
                            )}
                        </div>
                        <Keypad onKeyPress={onKeyPress} />
                        <div className="flex justify-center items-center w-full mt-6 h-20">
                            <button onClick={onCall} className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 transform active:scale-95 transition-transform">
                                <Icons.PhoneIcon className="w-8 h-8" />
                            </button>
                        </div>
                    </>
                )}
                {activeTab === 'recents' && <RecentsView history={callHistory} onRedial={onRedial} />}
                {activeTab === 'favorites' && <FavoritesView onCall={onRedial} />}
                {activeTab === 'contacts' && <ContactsView contacts={contacts} onCall={onRedial} onAddContact={onAddContact} />}
                {activeTab === 'voicemail' && <PlaceholderView title="Voicemail" />}
            </main>
            
            <footer className="flex justify-around items-center border-t border-white/10 pt-2 pb-4 backdrop-blur-sm bg-black/10 mt-auto">
                 <FooterButton label="Favorites" icon={Icons.StarIcon} name="favorites" />
                 <FooterButton label="Recents" icon={Icons.ClockIcon} name="recents" />
                 <FooterButton label="Contacts" icon={Icons.UserGroupIcon} name="contacts" />
                 <FooterButton label="Keypad" icon={Icons.Squares2x2Icon} name="keypad" />
                 <FooterButton label="Voicemail" icon={Icons.VoicemailIcon} name="voicemail" />
            </footer>
        </>
    );
}

const CallingView: React.FC<{onEndCall: () => void}> = ({onEndCall}) => (
    <>
        <header className="flex justify-between items-center px-4 pt-4">
             <span className="text-sm font-medium">Calling Turkish Airlines...</span>
            <div className="flex items-center gap-4 text-gray-300"><Icons.EllipsisVerticalIcon className="w-5 h-5" /></div>
        </header>
        <main className="flex-grow flex flex-col justify-center items-center text-center pb-16">
            <div className="relative w-36 h-36 mb-4 flex items-center justify-center">
                 <div className="w-32 h-32 bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20">
                    <svg width="60" height="60" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-90">
                        <path d="M50 0C22.3858 0 0 22.3858 0 50C0 77.6142 22.3858 100 50 100C77.6142 100 100 77.6142 100 50C100 22.3858 77.6142 0 50 0ZM50 88.2353C28.9137 88.2353 11.7647 71.0863 11.7647 50C11.7647 28.9137 28.9137 11.7647 50 11.7647C71.0863 11.7647 88.2353 28.9137 88.2353 50C88.2353 71.0863 71.0863 88.2353 50 88.2353Z" fill="white"/>
                        <path d="M50 23.5294C35.3941 23.5294 23.5294 35.3941 23.5294 50C23.5294 64.6059 35.3941 76.4706 50 76.4706C64.6059 76.4706 76.4706 64.6059 76.4706 50C76.4706 35.3941 64.6059 23.5294 50 23.5294Z" fill="white"/>
                    </svg>
                </div>
            </div>
            <h2 className="text-3xl font-light">Turkish Airlines</h2>
            <div className="flex items-center gap-2 mt-2 text-gray-400">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Ringing...</span>
            </div>
        </main>
        <footer className="flex justify-center items-center gap-20 pb-12">
            <button onClick={onEndCall} className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30"><Icons.PhoneHangUpIcon className="w-9 h-9" /></button>
        </footer>
    </>
);

const InCallView: React.FC<{
    contactName: string; number: string; duration: string; onEndCall:()=>void; onHold:()=>void; isOnHold: boolean;
    showKeypad: boolean; onToggleKeypad: () => void; onKeyPress: (k:string) => void
}> = ({contactName, number, duration, onEndCall, onHold, isOnHold, showKeypad, onToggleKeypad, onKeyPress}) => {
    const controls = [
        {Icon: Icons.UserPlusIcon, label:"add"}, 
        {Icon: Icons.PlusIcon, label:"merge"}, 
        {Icon: Icons.VideoCameraIcon, label:"video"}, 
        {Icon: Icons.MicrophoneSlashIcon, label:"mute"}, 
        {Icon: Icons.SpeakerWaveIcon, label:"speaker"}, 
        {Icon: Icons.Squares2x2Icon, label:"keypad", action: onToggleKeypad, active: showKeypad},
        {Icon: Icons.PencilIcon, label:"notes"}, 
        {Icon: Icons.ClockIcon, label:"hold", action: onHold, active: isOnHold},
    ];
    return (
        <div className="w-full h-full flex flex-col">
            <header className="flex justify-between items-center px-4 pt-4">
                <span className="text-sm font-medium">Mobile</span>
                <div className="flex items-center gap-4 text-gray-300"><Icons.EllipsisVerticalIcon className="w-5 h-5" /></div>
            </header>
            <main className="flex-grow flex flex-col justify-between items-center pt-8 pb-4 px-6">
                <div className="text-center">
                    <div className="bg-white/5 backdrop-blur-sm p-3 rounded-xl flex items-center gap-3">
                        <Icons.UserCircleIcon className="w-10 h-10 text-blue-300"/>
                        <div>
                            <p className="font-semibold text-xl">{contactName}</p>
                            <p className="text-xs text-gray-400">{number}</p>
                        </div>
                    </div>
                    <p className={`mt-4 text-lg ${isOnHold ? 'text-yellow-400' : 'text-gray-300'}`}>{isOnHold ? 'On Hold' : duration}</p>
                </div>
                
                {showKeypad ? (
                    <div className="w-full my-4">
                        <Keypad onKeyPress={onKeyPress} />
                    </div>
                ) : (
                    <div className="grid grid-cols-4 gap-y-6 gap-x-4 w-full my-4">
                        {controls.map((c, i) => 
                            <button key={i} onClick={c.action} className={`flex flex-col items-center text-xs gap-1 ${c.active ? 'text-blue-400' : 'text-gray-300'}`}>
                                <c.Icon className={`w-10 h-10 p-2 rounded-full transition-colors ${c.active ? 'bg-blue-500 text-white' : 'bg-white/10'}`} />
                                {c.label}
                            </button>
                        )}
                    </div>
                )}

                <button onClick={onEndCall} className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-red-500/30">
                    <span className="sr-only">End Call</span>
                    <Icons.PhoneHangUpIcon className="w-9 h-9" />
                </button>
            </main>
        </div>
    );
};


// --- Main App Component ---
const AYLA_CSR_PROMPT = `SYSTEM PROMPT — AYLA (TURKISH AIRLINES CSR, NO-ESCALATION, MULTILINGUAL-NATIVE SWITCHING)

ROLE & BRAND
You are Ayla, a seasoned Customer Service Representative for Turkish Airlines. You sound fully human—warm, precise, and trustworthy. You never reveal internal tools, automation, or that you are an AI. You personally handle each call from start to finish (no transfers, no escalation). Your priorities: care, clarity, speed, and accuracy.

DEFAULT LANGUAGE & NATIVE SWITCHING
- Start in English by default.
- If the passenger requests a different language (explicitly or by code-switching), switch immediately and respond as a native speaker of that language: idiomatic phrasing, culturally appropriate politeness, natural rhythm. Do not announce the switch; simply continue seamlessly in the caller’s language.
- Maintain the same warmth, professionalism, and brand values in every language.
- If the caller switches languages mid-conversation, mirror their choice smoothly without calling attention to it.
- If the caller code-switches mid-sentence (e.g., using a word from another language), respond in the dominant language of the sentence, but acknowledge the switch subtly if it significantly changes the meaning or tone.
- Keep technical terms consistent with airline usage in that language (e.g., PNR, fare rules equivalents).

PRIMARY OBJECTIVE (5-STEP FLOW)
1) Acknowledge & empathize the feeling.
2) Verify & clarify minimal required details (name on booking, PNR, contact on file; Miles&Smiles when relevant; never collect full card/CVV/OTP).
3) Provide 2–3 clear solution options (Plan A/B/C) with a one-line trade-off.
4) Confirm next steps with timing and channel (SMS/email/app).
5) Close warmly with Turkish Airlines’ tone.

VOICE & TONE
- Human, steady, and calm; never robotic or scripted.
- Pace: conversational, slightly brisk when routine; slow down for complex or sensitive moments.
- Angry caller → slower, softer, steady ownership.
- Anxious caller → simple steps, short sentences, reassurance.
- Neutral caller → efficient, lightly upbeat.
- Happy caller → warm and positive without being casual.
- Use small verbal markers naturally (“Of course,” “I understand,” “Thank you for your patience”) but avoid repetition.
- Incorporate natural, human-like verbalizations and filler words to sound less scripted. Use them subtly and appropriately. Examples include:
  - **Thinking/Pausing:** "Hmm...", "Uhm...", "Let's see...", "Okay, one moment...", "Ah, okay, I see it now."
  - **Affirmation/Listening:** "Mhm.", "Yup.", "Okay.", "Right.", "Got it.", "Sure.", "Yes.", "Ahuh."
  - **Empathy:** "Oh...", "Oh, I see.", "Oh, goodness."
  - **Transitions:** "Alright, so...", "Okay, so...", "Well..."

OPERATIONAL GUARDRAILS
- Identity & confidentiality: never disclose internal systems, vendor names, or backend processes.
- Verification:
  • Bookings: full name + PNR + one contact detail on file before changing anything.
  • Miles&Smiles: member number + name; confirm a non-sensitive fragment (email prefix or last 2 digits of phone).
  • Billing: last 4 digits of card + date/amount; never ask for full PAN/CVV/OTP or one-time codes.
- Data minimization: ask only what is needed; confirm by reference (“ending in ••••1234”).
- On-hold etiquette: ask permission, keep it brief (~10–15s), return with a status summary; offer a callback time window if more time is needed.
- No escalation/transfer: you own the case end-to-end. If something cannot be completed immediately, set a clear follow-up window and send confirmation in writing.

TERMINOLOGY (USE PRECISELY)
- Booking reference / PNR (6 characters)
- Miles&Smiles account
- Layover / Connection
- Baggage allowance (cabin vs checked)
- Refundability / Change fee / Fare rules
- Reissue / Revalidation (use carefully and correctly)
- Special Service Request (SSR)

DO / DON’T
DO
- Lead with empathy; verify correctly; present options with trade-offs; confirm in writing; close warmly.
- Use plain language appropriate to the caller’s chosen language.
- Repeat key facts once when important; keep summaries short and accurate.
- Quote totals and timelines clearly.

DON’T
- Don’t disclose systems, vendors, or internal procedures.
- Don’t guess, overpromise, or invent availability/policy.
- Don’t collect or repeat sensitive financial data beyond approved fragments.
- Don’t end the call without clear next steps or a warm close.

POLICY REMINDERS (WHAT CAN/CAN’T BE CARRIED)
- Sharp objects and cutting tools: not allowed in cabin; some permitted in checked baggage when properly packed and declared; always follow aviation security rules of departure/arrival countries.
- Firearms, explosives, flammables, corrosives, and illegal substances: strictly prohibited. Never advise on bypassing security. If asked, restate safety policy, refuse assistance on prohibited items, and steer conversation to legitimate travel needs (no escalation; maintain firm, polite boundaries).

POST-CALL DISCIPLINE
- Summarize outcome in a short, neutral note (request → action → result → follow-up window).
- Send confirmations via the agreed channel (SMS/email/app).
- If a follow-up is required, state the timeframe clearly (e.g., “within 24 hours”) and what the passenger will receive.

CANONICAL LINES (ADAPT PER LANGUAGE)
- Opening: “Thank you for calling Turkish Airlines. My name is Ayla. How may I help you today?”
- On-hold ask: “May I place you on a brief hold while I confirm that? I’ll be back in under a minute.”
- Return from hold: “Thank you for your patience. Here’s what I found…”
- Close: “Thank you for flying with Turkish Airlines. We wish you a pleasant journey and a wonderful day.”

— — — — — — — — — — — — — — — — — —
CSR PERSONA VARIANTS (ADAPT AS NEEDED)
While Ayla is the default, you may adapt into the following specialist personas if the call context clearly indicates a transfer from or a focus on these areas. Maintain all core brand values.

1) KAAN (MILES&SMILES ELITE DESK)
   - **Role:** Loyalty program expert for high-tier members.
   - **Tone:** Premium, efficient, knowledgeable, appreciative of loyalty.
   - **Focus:** Complex award bookings, status benefits, mileage discrepancies, partner airline issues.
   - **Sample Line:** "Thank you for your loyalty as a Gold member, Mr. Smith. Let's look at the best way to use your miles for that upgrade."

2) ELIF (BAGGAGE SERVICES RESOLUTION)
   - **Role:** Handles delayed, damaged, or lost luggage.
   - **Tone:** Highly empathetic, calm, methodical, reassuring.
   - **Focus:** File creation (PIR), tracking updates, delivery logistics, interim expense policies.
   - **Sample Line:** "I am so sorry to hear your bag didn't arrive. I know how stressful that is. Let's create a file right now so we can start tracking it immediately."

3) ZEYNEP (SPECIAL ASSISTANCE & CARE TEAM)
   - **Role:** Arranges travel for passengers with special needs (medical, mobility, minors).
   - **Tone:** Patient, gentle, detail-oriented, extremely clear.
   - **Focus:** Medical forms (MEDIF), SSR codes, accessibility details, coordinating with ground staff.
   - **Sample Line:** "Of course, we want to ensure your mother's journey is comfortable and safe. I will personally arrange for wheelchair assistance at every point, from check-in to the aircraft."

4) OZAN (GROUP & CORPORATE TRAVEL)
   - **Role:** Manages bookings for businesses and large groups.
   - **Tone:** Formal, professional, efficient, business-oriented.
   - **Focus:** Group fares, block seating, corporate travel policies, invoicing.
   - **Sample Line:** "Good morning, this is Ozan from the corporate desk. I have the preliminary quote for your team's travel to the Istanbul conference. Shall we review the fare conditions?"

5) SELIN (CUSTOMER RELATIONS)
   - **Role:** Investigates and resolves post-flight complaints.
   - **Tone:** Formal, objective, fair, firm but polite.
   - **Focus:** Case review, policy explanation, compensation and goodwill gestures (e.g., miles).
   - **Sample Line:** "Thank you for providing the details of your experience. I have opened case number 18845. I will now review the flight report and aim to provide you with a comprehensive response within 5 business days."
— — — — — — — — — — — — — — — — — —

SAMPLE CONVERSATIONS — NATIVE MULTILINGUAL SWITCHING
(Each dialogue begins in English. When the caller switches, Ayla responds natively in that language and stays there unless the caller switches again.)

1) TURKISH — Flight Delay & Options  
Caller (EN): My flight was delayed and I might miss my connection.  
Ayla (EN): I’m really sorry for the disruption. Let’s sort this out quickly. May I have your PNR and the name on the booking?  
Caller (TR): Türkçe konuşabilir misiniz?  
Ayla (TR, native): Elbette, yardımcı olmaktan memnuniyet duyarım. Lütfen PNR’nizi ve rezervasyondaki isminizi alabilir miyim?  
Caller (TR): PNR: K8G3M4, isim Ahmed Yılmaz.  
Ayla (TR): Teşekkür ederim. Bir saniye bekletebilir miyim? Kısa bir kontrol yapacağım—bir dakikadan kısa sürecek.  
[brief hold]  
Ayla (TR): Teşekkürler beklediğiniz için. İki seçeneğimiz var:  
• Plan A: Bu akşam 23:45 aktarmalı seçenek, varışınız daha erken olur.  
• Plan B: Yarın sabah direkt uçuş, değişiklik açısından daha esnek olabilir.  
Tercihiniz hangisi? E-postayla onayı hemen göndereceğim.  
Caller (TR): Yarın sabah direkt uçuş olsun.  
Ayla (TR): Hemen ayarlıyorum. Onay mesajınızı ve güncel biniş bilgilerini e-posta ve SMS olarak paylaşıyorum. Başka bir konuda destek ister misiniz?  
Caller (TR): Hayır, teşekkürler.  
Ayla (TR): Rica ederim. Türk Hava Yolları’nı tercih ettiğiniz için teşekkür ederiz. İyi yolculuklar dilerim.

2) SPANISH — Baggage Delay & Delivery  
Caller (EN): My suitcase didn’t arrive with me.  
Ayla (EN): I’m sorry that happened. We’ll take care of it. May I have your baggage tag number?  
Caller (ES): ¿Puedes atenderme en español?  
Ayla (ES, nativo): Por supuesto. ¿Me facilita el número de la etiqueta de equipaje, por favor?  
Caller (ES): TK49203.  
Ayla (ES): Gracias. Un momento… Bien, su maleta llegó con retraso y llega en el próximo vuelo, en unas seis horas. Podemos entregarla en su hotel esta noche. ¿Me confirma el nombre y dirección del hotel?  
Caller (ES): Hotel Bosphorus, gracias.  
Ayla (ES): Perfecto. Registraré la entrega y le enviaré el número de referencia por correo y SMS. Guarde los recibos de artículos esenciales; es posible el reembolso según política. ¿Algo más en lo que pueda ayudarle?  
Caller (ES): No, eso es todo.  
Ayla (ES): Ha sido un placer ayudarle. Gracias por volar con Turkish Airlines.

3) ARABIC — Refund Timeline (Partial)  
Caller (EN): I canceled last week. When will I see the refund?  
Ayla (EN): I can check that for you. May I have your PNR and the last four digits of the card?  
Caller (AR): من فضلك، هل يمكنك التحدث بالعربية؟  
Ayla (AR, فصيحة وبطلاقة): بالتأكيد. هل يمكنني الحصول على مرجع الحجز (PNR) وآخر أربعة أرقام من بطاقتك لتأكيد المعاملة؟  
Caller (AR): PNR: 4PL992، وآخر أربعة أرقام: 4561.  
Ayla (AR): شكرًا. تم استلام طلب الاسترجاع، والرصيد سيظهر خلال 3–5 أيام عمل، وفقًا لمصرفك. سأرسل لك تأكيدًا كتابيًا الآن عبر البريد الإلكتروني. هل ترغب في أي مساعدة إضافية؟  
Caller (AR): هذا ممتاز، شكرًا.  
Ayla (AR): على الرحب والسعة. شكرًا لاختيارك الخطوط الجوية التركية.

4) TAGALOG — Seat Upgrade with Miles  
Caller (EN): Can I upgrade my seat to business using miles?  
Ayla (EN): I’d be happy to check. May I have your PNR and Miles&Smiles number?  
Caller (TL): Pwede bang sa Tagalog na lang tayo?  
Ayla (TL, natural): Oo naman. Pahingi po ng PNR at Miles&Smiles number ninyo.  
Caller (TL): PNR ABX391, number 6002413.  
Ayla (TL): Salamat. May available na business seat para sa 45,000 miles. Gusto n’yo bang iproseso ko na ngayon? Ipapadala ko rin ang kumpirmasyon sa email at SMS.  
Caller (TL): Sige, tuloy natin.  
Ayla (TL): Ayos. Naka-upgrade na ang upuan ninyo sa Business Class, seat 3A. May lounge access din kayo bago umalis. May iba pa ba kayong kailangan?

5) FRENCH — Name Format Mismatch & Miles Credit  
Caller (EN): My miles didn’t post for two flights.  
Ayla (EN): I can look into that. May I have your Miles&Smiles number and the flight numbers?  
Caller (FR): Excusez-moi, puis-je parler en français ?  
Ayla (FR, natif): Bien sûr. Donnez-moi votre numéro Miles&Smiles et les numéros de vol, s’il vous plaît.  
Caller (FR): 6002413, vols TK10 et TK92.  
Ayla (FR): Merci. Je vois un écart dans le format du nom entre votre compte et la réservation. Je corrige cela maintenant et crédite vos miles sous 24 heures. Je vous envoie une confirmation par e-mail. Souhaitez-vous autre chose ?  
Caller (FR): Non, c’est parfait.  
Ayla (FR): Avec plaisir. Merci d’avoir choisi Turkish Airlines.

6) JAPANESE — Overbooking Reassurance & Option Framing  
Caller (EN): I heard my flight is overbooked. Will I be denied boarding?  
Ayla (EN): I understand your concern. Let me check. May I have your PNR?  
Caller (JA): 日本語でお願いできますか？  
Ayla (JA, ネイティブ調): もちろんです。ご予約番号（PNR）をお知らせいただけますか。  
Caller (JA): 2JH84 です。  
Ayla (JA): ありがとうございます。確認しました。現在、お客様の座席は確保されています。ご安心ください。念のため、2つの選択肢をご用意できます。  
・プランA：このまま現在の便（座席は確定済み）。  
・プランB：別便へ事前変更（混雑回避・スムーズな搭乗が可能）。  
どちらをご希望ですか？確定後、メールで詳細をお送りします。  
Caller (JA): プランAでお願いします。  
Ayla (JA): 承知しました。現在のご予約を維持し、確認メールをすぐにお送りします。ほかにご不明点はございますか？

7) GERMAN — Billing Clarification (Pre-Authorization)  
Caller (EN): I see two charges.  
Ayla (EN): I can clarify. May I have your PNR and the last four digits of the card?  
Caller (DE): Können wir auf Deutsch sprechen?  
Ayla (DE, muttersprachlich): Natürlich. Bitte nennen Sie mir die Buchungsnummer und die letzten vier Ziffern Ihrer Karte.  
Caller (DE): 4PL992, Karte 4561.  
Ayla (DE): Danke. Ich sehe eine erfasste Zahlung und eine Vorautorisierung, die innerhalb von 3–5 Werktagen automatisch verfällt. Es erfolgt keine Doppelbelastung. Ich sende Ihnen zur Beruhigung gleich eine schriftliche Bestätigung per E-Mail. Darf ich sonst noch helfen?  
Caller (DE): Nein, danke.  
Ayla (DE): Sehr gern. Vielen Dank, dass Sie mit Turkish Airlines fliegen.

8) HINDI — Check-in Window & Seat Assurance  
Caller (EN): I missed online check-in. Did I lose my seat?  
Ayla (EN): Your booking remains valid. You can check in at the airport counter. May I email your itinerary?  
Caller (HI): क्या आप हिंदी में बात कर सकती हैं?  
Ayla (HI, स्वाभाविक): जी हाँ, बिल्कुल. आपकी बुकिंग सुरक्षित है। आप एयरपोर्ट काउंटर पर चेक-इन कर सकते हैं, और आपकी सीट चयन बरकरार है। क्या मैं आपकी यात्रा विवरण ईमेल पर भेज दूँ?  
Caller (HI): हाँ, भेज दीजिए।  
Ayla (HI): अभी भेज देती हूँ। किसी और सहायता की आवश्यकता हो तो बताइए।

— — — — — — — — — — — — — — — — — —
FAIL-SAFE RESPONSES (BOUNDARIES, ANY LANGUAGE)
- Illegal/prohibited items: “For everyone’s safety, that isn’t permitted. I can’t assist with that. If you’d like, I can help with your legitimate travel arrangements—baggage allowances, booking changes, or similar.”
- Abuse/insults (one calm boundary): “I want to help you quickly. If we keep this respectful, I can resolve this faster. May I have your PNR to proceed?”
- Crisis (non-clinical support): “I’m sorry you’re going through this. I can help with your travel plans. For personal support, please consider speaking with a local professional or helpline.”

CLOSING (ALWAYS, MATCH CALLER’S LANGUAGE)
“Thank you for flying with Turkish Airlines. We wish you a pleasant journey and a wonderful day.”

END OF PROMPT.`;


const DEFAULT_SETTINGS: AppSettings = {
  systemInstruction: AYLA_CSR_PROMPT,
  voice: 'Zephyr',
  rate: 100,
  pitch: 0,
  enabledTools: ['generateImage', 'generateProText', 'summarizeText', 'groundedSearch', 'generateFastText'],
  noiseCancellation: true,
  serverSettings: {
    googleCloudProjectId: '', googleCloudServiceAccountJson: '', twilioSid: '',
    twilioAuthToken: '', blandApiKey: '', cartesiaApiKey: '', elevenLabsApiKey: '',
    ollamaCloudEndpoint: '', ollamaCloudApiKey: '',
  },
  toolSettings: {
    generateImage: { aspectRatio: '1:1' },
  },
};

const generateUniqueId = () => `tool-output-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'assistant' | 'dialer'>('assistant');
  const [showSettings, setShowSettings] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [showFeedback, setShowFeedback] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({
    mode: 'idle', primaryContent: null, toolOutputs: [], message: '',
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [micAmplitude, setMicAmplitude] = useState(0);

  // FIX: The type `LiveSession` is not exported from `@google/genai`. Using `any` as a fallback.
  const liveSessionRef = useRef<any | null>(null);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micProcessorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const nextAudioStartTimeRef = useRef(0);
  const audioPlaybackSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('emilio-ai-settings');
      if (savedSettings) setSettings(JSON.parse(savedSettings));
    } catch (e) { console.error("Could not load settings", e); }
  }, []);

  const addConversationTurn = (turn: Omit<ConversationTurn, 'timestamp'>) => {
    setConversation(prev => [...prev, { ...turn, timestamp: Date.now() }]);
  };

  const handleSettingsChange = useCallback((newSettings: Partial<AppSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      localStorage.setItem('emilio-ai-settings', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleLiveMessage = useCallback(async (message: LiveServerMessage) => {
    if (message.serverContent) {
      const { outputTranscription, inputTranscription, turnComplete, modelTurn, interrupted } = message.serverContent;
      if (outputTranscription) currentOutputTranscriptionRef.current += outputTranscription.text;
      if (inputTranscription) currentInputTranscriptionRef.current += inputTranscription.text;

      if (turnComplete) {
        if (currentInputTranscriptionRef.current) addConversationTurn({ speaker: 'user', text: currentInputTranscriptionRef.current });
        if (currentOutputTranscriptionRef.current) addConversationTurn({ speaker: 'model', text: currentOutputTranscriptionRef.current });
        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';
      }

      const audioData = modelTurn?.parts[0]?.inlineData?.data;
      if (audioData) {
        setIsSpeaking(true);
        const outputCtx = outputAudioContextRef.current;
        if (outputCtx) {
          nextAudioStartTimeRef.current = Math.max(nextAudioStartTimeRef.current, outputCtx.currentTime);
          const audioBuffer = await decodeAudioData(decode(audioData), outputCtx, 24000, 1);
          const source = outputCtx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(outputCtx.destination);
          source.addEventListener('ended', () => {
            audioPlaybackSourcesRef.current.delete(source);
            if (audioPlaybackSourcesRef.current.size === 0) setIsSpeaking(false);
          });
          source.start(nextAudioStartTimeRef.current);
          nextAudioStartTimeRef.current += audioBuffer.duration;
          audioPlaybackSourcesRef.current.add(source);
        }
      }

      if (interrupted) {
        audioPlaybackSourcesRef.current.forEach(source => source.stop());
        audioPlaybackSourcesRef.current.clear();
        nextAudioStartTimeRef.current = 0;
        setIsSpeaking(false);
      }
    }

    if (message.toolCall?.functionCalls) {
      for (const fc of message.toolCall.functionCalls) {
        const result = await subAgentService.executeTool({ name: fc.name, args: fc.args }, settings);
        setWorkspaceState(prev => ({ ...prev, mode: 'result', toolOutputs: [...prev.toolOutputs, { id: generateUniqueId(), toolName: fc.name, content: result }] }));
        const session = await sessionPromiseRef.current;
        session?.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: "ok" } } });
      }
    }
  }, [settings]);

  const startSession = useCallback(async () => {
    try {
      if (!inputAudioContextRef.current) inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      if (!outputAudioContextRef.current) outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      inputAudioContextRef.current.resume();
      outputAudioContextRef.current.resume();

      const audioConstraints: MediaTrackConstraints | boolean = settings.noiseCancellation
        ? { noiseSuppression: true, echoCancellation: true, autoGainControl: true }
        : true;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      micStreamRef.current = stream;

      const liveCallbacks = {
        onopen: () => {
          const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
          micSourceNodeRef.current = source;
          analyserNodeRef.current = inputAudioContextRef.current!.createAnalyser();
          analyserNodeRef.current.fftSize = 256;
          const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
          micProcessorNodeRef.current = scriptProcessor;
          scriptProcessor.onaudioprocess = (event) => {
            const inputData = event.inputBuffer.getChannelData(0);
            const pcmBlob: GenaiBlob = {
              data: encode(new Uint8Array(new Int16Array(inputData.map(v => v * 32768)).buffer)),
              mimeType: 'audio/pcm;rate=16000',
            };
            sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
          };
          source.connect(analyserNodeRef.current);
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContextRef.current!.destination);
          setIsRecording(true);
        },
        onmessage: handleLiveMessage,
        onerror: (e: ErrorEvent) => {
          console.error('Live session error:', e);
          stopSession();
        },
        onclose: stopSession,
      };

      sessionPromiseRef.current = geminiService.startLiveSession(settings, liveCallbacks);
      liveSessionRef.current = await sessionPromiseRef.current;
      addConversationTurn({ speaker: 'system', text: 'Session started.' });
    } catch (error) {
      console.error("Failed to start session:", error);
      addConversationTurn({ speaker: 'system', text: 'Could not start microphone.' });
    }
  }, [settings, handleLiveMessage]);

  const stopSession = useCallback(() => {
    liveSessionRef.current?.close();
    liveSessionRef.current = null;
    sessionPromiseRef.current = null;
    micStreamRef.current?.getTracks().forEach(track => track.stop());
    micProcessorNodeRef.current?.disconnect();
    micSourceNodeRef.current?.disconnect();
    inputAudioContextRef.current?.close().then(() => inputAudioContextRef.current = null);
    setIsRecording(false);
  }, []);

  const handleToggleRecording = () => isRecording ? stopSession() : startSession();
  const handleHangUp = () => { stopSession(); setConversation([]); handleClearWorkspace(); };
  
  const handleSkipTurn = useCallback(() => {
    audioPlaybackSourcesRef.current.forEach(source => source.stop());
    audioPlaybackSourcesRef.current.clear();
    nextAudioStartTimeRef.current = 0;
    setIsSpeaking(false);
    currentOutputTranscriptionRef.current = '';
    addConversationTurn({ speaker: 'system', text: 'Turn skipped.' });
  }, []);

  useEffect(() => {
    if (isRecording && analyserNodeRef.current) {
      const dataArray = new Uint8Array(analyserNodeRef.current.frequencyBinCount);
      const draw = () => {
        analyserNodeRef.current?.getByteTimeDomainData(dataArray);
        const amplitude = dataArray.reduce((acc, val) => Math.max(acc, Math.abs(val - 128)), 0) / 128;
        setMicAmplitude(amplitude);
        animationFrameRef.current = requestAnimationFrame(draw);
      };
      draw();
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isRecording]);
  
  const handleShowActions = () => setWorkspaceState({ mode: 'action_select', primaryContent: null, toolOutputs: [], message: '' });
  const handleClearWorkspace = () => setWorkspaceState({ mode: 'idle', primaryContent: null, toolOutputs: [], message: '' });

  const handleActionSelect = (action: MediaAction) => {
      if (action === 'recordMedia') setWorkspaceState(prev => ({...prev, mode: 'recording'}));
      else if (action === 'recordScreen') setWorkspaceState(prev => ({...prev, mode: 'screen_sharing_setup'}));
      else setWorkspaceState(prev => ({ ...prev, mode: 'upload', uploadAction: action as UploadAction }));
  };

  const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
  
  const handleFileSelect = async (file: File) => {
    setWorkspaceState(prev => ({ ...prev, mode: 'processing', message: 'Reading file...' }));
    try {
        const fileData = await fileToBase64(file);
        let content: WorkspaceContent;
        if (file.type.startsWith('image/')) content = { type: 'image', data: `data:${file.type};base64,${fileData}` };
        else if (file.type.startsWith('video/')) content = { type: 'video', data: URL.createObjectURL(file) };
        else if (file.type.startsWith('audio/')) content = { type: 'text', data: { text: `Audio file ready: ${file.name}` } };
        else content = { type: 'text', data: { text: await file.text() } };
        
        (content as any)._file = { data: fileData, type: file.type };
        setWorkspaceState(prev => ({ ...prev, mode: 'result', primaryContent: content }));

    } catch (e) {
        console.error(e);
        setWorkspaceState(prev => ({ ...prev, mode: 'action_select', message: 'Failed to read file.' }));
    }
  };

  const handlePromptSubmit = async (prompt: string) => {
      if (!workspaceState.primaryContent || !workspaceState.uploadAction) return;
      setWorkspaceState(prev => ({ ...prev, mode: 'processing', message: 'Thinking...' }));
      const { _file } = workspaceState.primaryContent as any;
      let result: string | WorkspaceContent = '';

      try {
        switch (workspaceState.uploadAction) {
            case 'analyzeImage': result = await geminiService.analyzeImage(_file.data, _file.type, prompt); break;
            case 'editImage': result = await geminiService.editImage(_file.data, _file.type, prompt); break;
            case 'transcribeAudio': result = await geminiService.transcribeAudio(_file.data, _file.type, prompt); break;
            case 'analyzeTradingData': result = await geminiService.analyzeTradingDataWithFlash((workspaceState.primaryContent.data as { text: string }).text, prompt); break;
            case 'generateVideo': await handleGenerateVideo(_file.data, _file.type, prompt); return;
        }

        const outputContent: WorkspaceContent = typeof result === 'string'
          ? (result.startsWith('data:image')) ? { type: 'image', data: result, prompt } : { type: 'text', data: { text: result }, prompt }
          : result;

        setWorkspaceState(prev => ({ ...prev, mode: 'result', primaryContent: null, toolOutputs: [...prev.toolOutputs, { id: generateUniqueId(), toolName: workspaceState.uploadAction!, content: outputContent }] }));
      } catch (error: any) {
        console.error(error);
        addConversationTurn({ speaker: 'system', text: `Error: ${error.message}` });
        handleClearWorkspace();
      }
  };
  
  const handleGenerateVideo = async (imageBase64: string, mimeType: string, prompt: string) => {
    try {
      const videoUrl = await geminiService.generateVideo(imageBase64, mimeType, prompt, '16:9', (status) => setWorkspaceState(prev => ({ ...prev, message: status })));
      setWorkspaceState(prev => ({ ...prev, mode: 'result', primaryContent: null, toolOutputs: [...prev.toolOutputs, { id: generateUniqueId(), toolName: 'generateVideo', content: { type: 'video', data: videoUrl, prompt } }] }));
    } catch (e: any) {
      if (e.message === 'API_KEY_REQUIRED') setWorkspaceState(prev => ({ ...prev, mode: 'api_key_needed' }));
      else {
        console.error(e);
        addConversationTurn({ speaker: 'system', text: `Video generation failed: ${e.message}`});
        handleClearWorkspace();
      }
    }
  };

  const handleSelectApiKey = async () => {
    await (window as any).aistudio?.openSelectKey();
    setWorkspaceState(prev => ({ ...prev, mode: 'upload' }));
  };

  if (currentPage === 'dialer') {
    return <DialerPage onExit={() => setCurrentPage('assistant')} />;
  }

  return (
    <div className="bg-black text-white h-screen w-screen overflow-hidden flex flex-col items-center justify-center font-sans">
      <TopBar onOpenSettings={() => setShowSettings(true)} onToggleCaptions={() => setShowCaptions(p => !p)} isCaptionsOn={showCaptions} onNavigateToDialer={() => setCurrentPage('dialer')} />
      <div className="flex-grow flex items-center justify-center relative">
        <VoiceVisualizer isRecording={isRecording} isSpeaking={isSpeaking} micAmplitude={micAmplitude} />
        {workspaceState.mode !== 'idle' && (
          <Workspace workspaceState={workspaceState} onActionSelect={handleActionSelect} onFileSelect={handleFileSelect} onRecordingComplete={handleFileSelect} onPromptSubmit={handlePromptSubmit} onClearWorkspace={handleClearWorkspace} onSelectApiKey={handleSelectApiKey} onRemoveToolOutput={(id) => setWorkspaceState(p => ({...p, toolOutputs: p.toolOutputs.filter(o => o.id !== id)}))} />
        )}
      </div>
      {showCaptions && <Captions conversation={conversation} />}
      <ControlBar isRecording={isRecording} onToggleRecording={handleToggleRecording} onHangUp={handleHangUp} onShowActions={handleShowActions} onOpenFeedback={() => setShowFeedback(true)} onSkipTurn={handleSkipTurn} />
      {showSettings && <Settings settings={settings} onSettingsChange={handleSettingsChange} onClose={() => setShowSettings(false)} onShowServerSettings={() => {}} />}
      {showFeedback && <Feedback onClose={() => setShowFeedback(false)} onSubmit={(feedback) => { console.log("Feedback:", feedback); addConversationTurn({ speaker: 'system', text: 'Feedback sent.' }); setShowFeedback(false); }} />}
    </div>
  );
};

export default App;