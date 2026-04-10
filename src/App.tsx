/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, 
  Image as ImageIcon, 
  User, 
  Sparkles, 
  Download, 
  RefreshCw,
  X,
  Palette,
  Type,
  Save,
  Trash2,
  Wand2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/src/lib/utils";

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface ImageState {
  base64: string;
  mimeType: string;
}

interface SavedStyle {
  id: string;
  name: string;
  images: ImageState[];
}

interface Character {
  id: string;
  name: string;
  images: ImageState[];
}

export default function App() {
  const [styleImages, setStyleImages] = useState<ImageState[]>([]);
  const [currentActorImages, setCurrentActorImages] = useState<ImageState[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [styleName, setStyleName] = useState("");
  const [savedStyles, setSavedStyles] = useState<SavedStyle[]>([]);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [actorName, setActorName] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<string[]>([]);
  const [refinementPrompt, setRefinementPrompt] = useState("");

  const styleInputRef = useRef<HTMLInputElement>(null);
  const actorInputRef = useRef<HTMLInputElement>(null);

  // Load saved data from API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const stylesRes = await fetch("/api/styles");
        const styles = await stylesRes.json();
        setSavedStyles(styles);

        const charsRes = await fetch("/api/characters");
        const chars = await charsRes.json();
        setCharacters(chars);
      } catch (e) {
        console.error("Failed to fetch data", e);
      }
    };
    fetchData();

    // Load active session state (still using localStorage for transient session state)
    const activeStyle = localStorage.getItem("toonstyle_active_style");
    if (activeStyle) {
      try { setStyleImages(JSON.parse(activeStyle)); } catch (e) { console.error(e); }
    }
    const activePrompt = localStorage.getItem("toonstyle_active_prompt");
    if (activePrompt) setPrompt(activePrompt);
    
    const activeCharacterIds = localStorage.getItem("toonstyle_active_character_ids");
    if (activeCharacterIds) {
      try { setSelectedCharacterIds(JSON.parse(activeCharacterIds)); } catch (e) { console.error(e); }
    }
  }, []);

  // Persist active session state (debounced slightly to avoid storage thrashing)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    const timer = setTimeout(() => {
      try {
        localStorage.setItem("toonstyle_active_style", JSON.stringify(styleImages));
        localStorage.setItem("toonstyle_active_prompt", prompt);
        localStorage.setItem("toonstyle_active_character_ids", JSON.stringify(selectedCharacterIds));
      } catch (e) {
        console.warn("Failed to persist session state", e);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [styleImages, prompt, selectedCharacterIds]);

  // Save styles to SQLite
  const saveStyle = async () => {
    if (!styleName.trim() || styleImages.length === 0) return;
    
    const id = selectedStyleId || Date.now().toString();
    const newStyle: SavedStyle = {
      id,
      name: styleName.trim(),
      images: [...styleImages]
    };

    try {
      await fetch("/api/styles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newStyle)
      });
      
      const res = await fetch("/api/styles");
      const updated = await res.json();
      setSavedStyles(updated);
      setSelectedStyleId(id);
      setError(null);
    } catch (e) {
      setError("Failed to save style");
    }
  };

  // Save characters to SQLite
  const saveCharacter = async () => {
    if (!actorName.trim() || currentActorImages.length === 0) return;
    const newCharacter: Character = {
      id: Date.now().toString(),
      name: actorName.trim(),
      images: [...currentActorImages]
    };

    try {
      await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCharacter)
      });
      
      const res = await fetch("/api/characters");
      const updated = await res.json();
      setCharacters(updated);
      setActorName("");
      setCurrentActorImages([]);
      setError(null);
    } catch (e) {
      setError("Failed to save character");
    }
  };

  const deleteStyle = async (id: string) => {
    try {
      await fetch(`/api/styles/${id}`, { method: "DELETE" });
      setSavedStyles(prev => prev.filter(s => s.id !== id));
      if (selectedStyleId === id) {
        setSelectedStyleId(null);
        setStyleName("");
        setStyleImages([]);
      }
    } catch (e) {
      setError("Failed to delete style");
    }
  };

  const deleteCharacter = async (id: string) => {
    try {
      await fetch(`/api/characters/${id}`, { method: "DELETE" });
      setCharacters(prev => prev.filter(c => c.id !== id));
      setSelectedCharacterIds(prev => prev.filter(cid => cid !== id));
    } catch (e) {
      setError("Failed to delete character");
    }
  };

  const loadStyle = (style: SavedStyle) => {
    setStyleImages(style.images);
    setStyleName(style.name);
    setSelectedStyleId(style.id);
  };

  const clearStyleSelection = () => {
    setSelectedStyleId(null);
    setStyleName("");
    setStyleImages([]);
  };

  const toggleCharacterSelection = (id: string) => {
    setSelectedCharacterIds(prev => 
      prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
    );
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "style" | "actor"
  ) => {
    const files = Array.from(e.target.files || []) as File[];
    if (files.length === 0) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(",")[1];
        const state = { base64, mimeType: file.type };
        if (type === "style") {
          setStyleImages(prev => [...prev, state]);
        } else {
          setCurrentActorImages(prev => [...prev, state]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const generateCartoon = async () => {
    if (styleImages.length === 0) {
      setError("Please provide at least one style image.");
      return;
    }
    
    const selectedCharactersData = characters.filter(c => selectedCharacterIds.includes(c.id));
    const hasSubjects = currentActorImages.length > 0 || selectedCharactersData.length > 0;

    if (!prompt && !hasSubjects) {
      setError("Please provide a description or at least one actor.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const model = "gemini-2.5-flash-image";
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const parts: any[] = [];

      // 1. Add Style References
      parts.push({ text: "ARTISTIC STYLE REFERENCE IMAGES (Use these to define the lines, colors, and overall aesthetic):" });
      styleImages.forEach(img => {
        parts.push({
          inlineData: {
            data: img.base64,
            mimeType: img.mimeType,
          },
        });
      });

      // 2. Add Character References
      selectedCharactersData.forEach(char => {
        parts.push({ text: `CHARACTER REFERENCE IMAGES FOR "${char.name.toUpperCase()}" (Capture this person's unique facial features, hair, and likeness):` });
        char.images.forEach(img => {
          parts.push({
            inlineData: {
              data: img.base64,
              mimeType: img.mimeType,
            },
          });
        });
      });

      // 3. Add Ad-hoc Actor References
      if (currentActorImages.length > 0) {
        parts.push({ text: "ADDITIONAL ACTOR REFERENCE IMAGES:" });
        currentActorImages.forEach(img => {
          parts.push({
            inlineData: {
              data: img.base64,
              mimeType: img.mimeType,
            },
          });
        });
      }

      const styleCount = styleImages.length;
      const styleRef = styleCount > 1 
        ? `the artistic styles synthesized from the ${styleCount} provided style reference images`
        : `the artistic style of the provided style reference image`;

      let subjectRef = "";
      if (selectedCharactersData.length > 0 || currentActorImages.length > 0) {
        const names = selectedCharactersData.map(c => c.name);
        if (currentActorImages.length > 0) names.push("the person in the additional actor images");
        subjectRef = ` featuring ${names.join(" and ")}. It is CRITICAL that you maintain the exact likeness and unique features of these characters as shown in their specific reference images.`;
      }

      const fullPrompt = `TASK: Create a high-quality cartoon/caricature.
STYLE: Strictly follow ${styleRef}.
SUBJECTS: ${subjectRef}
SCENE DESCRIPTION: ${prompt}
FINAL REQUIREMENT: Synthesize the character likenesses into the requested artistic style perfectly.`;

      parts.push({ text: fullPrompt });

      const response = await ai.models.generateContent({
        model,
        contents: { parts },
      });

      const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (imagePart?.inlineData) {
        setResultImage(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
      } else {
        throw new Error("No image was generated. Try adjusting your prompt.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to generate image. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const refineImage = async () => {
    if (!resultImage || !refinementPrompt.trim()) return;

    setIsRefining(true);
    setError(null);

    try {
      const model = "gemini-2.5-flash-image";
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      // Extract base64 from data URL
      const base64Data = resultImage.split(",")[1];
      const mimeType = resultImage.split(",")[0].split(":")[1].split(";")[0];

      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: mimeType,
              },
            },
            { text: `Modify this cartoon image based on these instructions: ${refinementPrompt}. Keep the existing artistic style and character features consistent.` }
          ]
        },
      });

      const imagePart = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (imagePart?.inlineData) {
        setResultImage(`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`);
        setRefinementPrompt("");
      } else {
        throw new Error("Failed to refine image.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to refine image.");
    } finally {
      setIsRefining(false);
    }
  };

  const downloadImage = () => {
    if (!resultImage) return;
    const link = document.createElement("a");
    link.href = resultImage;
    link.download = "toonstyle-creation.png";
    link.click();
  };

  return (
    <div className="min-h-screen bg-[#FDFCFB] text-[#1A1A1A] font-sans selection:bg-[#00FF00] selection:text-black">
      {/* Header */}
      <header className="border-b border-black p-6 flex justify-between items-center bg-white sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00FF00] border-2 border-black flex items-center justify-center rotate-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter italic">ToonStyle</h1>
        </div>
        <div className="hidden md:block text-xs font-mono uppercase tracking-widest opacity-50">
          Style-Driven Cartoon Engine v1.0
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 min-h-[calc(100vh-89px)]">
        {/* Left Column: Controls */}
        <div className="p-8 border-r border-black flex flex-col gap-10">
          
          {/* Step 1: Style Reference */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-black text-white px-2 py-0.5 text-xs font-bold">01</span>
                <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <Palette className="w-4 h-4" /> Reference Styles
                </h2>
              </div>
              <span className="text-[10px] font-mono opacity-50 uppercase">{styleImages.length} Images</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {styleImages.map((img, idx) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  key={idx}
                  className="relative aspect-square border-2 border-black rounded-xl overflow-hidden group shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <img 
                    src={`data:${img.mimeType};base64,${img.base64}`} 
                    className="w-full h-full object-cover"
                    alt={`Style ${idx + 1}`}
                  />
                  <button 
                    onClick={() => setStyleImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-1 right-1 p-1 bg-white border border-black rounded-full hover:bg-[#FF0000] hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
              
              <button 
                onClick={() => styleInputRef.current?.click()}
                className="aspect-square border-2 border-dashed border-black rounded-xl bg-[#F9F9F9] hover:bg-[#F0F0F0] transition-all flex flex-col items-center justify-center gap-2 group"
              >
                <Upload className="w-5 h-5 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] font-bold uppercase">Add Style</span>
                <input 
                  type="file" 
                  ref={styleInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  multiple
                  onChange={(e) => handleImageUpload(e, "style")}
                />
              </button>
            </div>

            {/* Save Style Logic */}
            {styleImages.length > 0 && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="Style Name (e.g. Retro Comic)"
                    value={styleName}
                    onChange={(e) => setStyleName(e.target.value)}
                    className="flex-1 px-3 py-2 border border-black rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#00FF00] outline-none"
                  />
                  <button 
                    onClick={saveStyle}
                    disabled={!styleName.trim()}
                    className="px-3 py-2 bg-black text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 transition-all flex items-center gap-2 text-xs font-bold uppercase"
                  >
                    <Save className="w-3 h-3" /> {selectedStyleId ? "Update" : "Save"}
                  </button>
                </div>
                {selectedStyleId && (
                  <button 
                    onClick={clearStyleSelection}
                    className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:underline flex items-center gap-1"
                  >
                    <X className="w-2 h-2" /> Clear Selection / New Style
                  </button>
                )}
              </div>
            )}

            {/* Saved Styles Library */}
            {savedStyles.length > 0 && (
              <div className="pt-4 border-t border-black/10">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3">Saved Library</h3>
                <div className="flex flex-wrap gap-2">
                  {savedStyles.map(style => (
                    <div key={style.id} className="group relative">
                      <button 
                        onClick={() => loadStyle(style)}
                        className={cn(
                          "px-3 py-1.5 border border-black rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-2",
                          selectedStyleId === style.id ? "bg-[#00FF00] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white hover:bg-[#F0F0F0]"
                        )}
                      >
                        <Palette className="w-3 h-3" /> {style.name}
                      </button>
                      <button 
                        onClick={() => deleteStyle(style.id)}
                        className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-black"
                      >
                        <Trash2 className="w-2 h-2" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {styleImages.length === 0 && savedStyles.length === 0 && (
              <p className="text-[10px] opacity-50 italic">Upload one or more images to define the artistic "look"</p>
            )}
          </section>

          {/* Step 2: Actors & Characters */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-black text-white px-2 py-0.5 text-xs font-bold">02</span>
                <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <User className="w-4 h-4" /> Actors & Prompt
                </h2>
              </div>
              <span className="text-[10px] font-mono opacity-50 uppercase">
                {currentActorImages.length + selectedCharacterIds.length} Active
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Character Builder */}
              <div className="space-y-3 bg-[#F9F9F9] p-4 border-2 border-black rounded-2xl shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <h3 className="text-[10px] font-black uppercase tracking-widest opacity-60">Character Builder</h3>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {currentActorImages.map((img, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={idx}
                      className="relative aspect-square border-2 border-black rounded-xl overflow-hidden group shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] bg-white"
                    >
                      <img 
                        src={`data:${img.mimeType};base64,${img.base64}`} 
                        className="w-full h-full object-cover"
                        alt={`Actor ${idx + 1}`}
                      />
                      <button 
                        onClick={() => setCurrentActorImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 p-1 bg-white border border-black rounded-full hover:bg-[#FF0000] hover:text-white transition-colors"
                      >
                        <X className="w-2 h-2" />
                      </button>
                    </motion.div>
                  ))}
                  <button 
                    onClick={() => actorInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-black rounded-xl bg-white hover:bg-[#F0F0F0] transition-all flex flex-col items-center justify-center gap-1 group"
                  >
                    <Upload className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-[8px] font-bold uppercase">Define Actor</span>
                    <input 
                      type="file" 
                      ref={actorInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      multiple
                      onChange={(e) => handleImageUpload(e, "actor")}
                    />
                  </button>
                </div>

                {currentActorImages.length > 0 && (
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Actor Name (e.g. Hero)"
                      value={actorName}
                      onChange={(e) => setActorName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-black rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#00FF00] outline-none bg-white"
                    />
                    <button 
                      onClick={saveCharacter}
                      disabled={!actorName.trim()}
                      className="px-3 py-2 bg-black text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 transition-all flex items-center gap-2 text-xs font-bold uppercase"
                    >
                      <Save className="w-3 h-3" /> Save to Library
                    </button>
                  </div>
                )}
              </div>

              {/* Character Library */}
              {characters.length > 0 && (
                <div className="pt-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3">Character Library</h3>
                  <div className="flex flex-wrap gap-3">
                    {characters.map(char => (
                      <div key={char.id} className="group relative">
                        <button 
                          onClick={() => toggleCharacterSelection(char.id)}
                          className={cn(
                            "pl-1 pr-3 py-1 border-2 border-black rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-2",
                            selectedCharacterIds.includes(char.id) ? "bg-[#00FF00] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white hover:bg-[#F0F0F0]"
                          )}
                        >
                          <div className="w-6 h-6 rounded-full border border-black overflow-hidden bg-zinc-100">
                            {char.images[0] && (
                              <img 
                                src={`data:${char.images[0].mimeType};base64,${char.images[0].base64}`} 
                                className="w-full h-full object-cover"
                                alt={char.name}
                              />
                            )}
                          </div>
                          {char.name}
                        </button>
                        <button 
                          onClick={() => deleteCharacter(char.id)}
                          className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity border border-black"
                        >
                          <Trash2 className="w-2 h-2" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Prompt Text */}
              <div className="flex flex-col gap-2">
                <textarea
                  placeholder="Describe the scene... (e.g. 'Hero and Sidekick are exploring a dark cave')"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full p-4 border-2 border-black rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#00FF00] resize-none font-medium text-sm min-h-[100px]"
                />
              </div>
            </div>
          </section>

          {/* Action */}
          <div className="mt-auto pt-6">
            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs font-bold rounded-lg flex items-center gap-2"
              >
                <X className="w-4 h-4" /> {error}
              </motion.div>
            )}
            
            <button
              onClick={generateCartoon}
              disabled={isGenerating || styleImages.length === 0 || (!prompt && currentActorImages.length === 0 && selectedCharacterIds.length === 0)}
              className={cn(
                "w-full py-4 bg-black text-white font-black uppercase tracking-widest text-lg rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95 shadow-[4px_4px_0px_0px_rgba(0,255,0,1)] hover:shadow-[6px_6px_0px_0px_rgba(0,255,0,1)] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
                isGenerating && "bg-zinc-800"
              )}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6 text-[#00FF00]" />
                  Create Cartoon
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Result */}
        <div className="p-8 bg-[#F0F0F0] flex flex-col items-center justify-center relative min-h-[400px]">
          <AnimatePresence mode="wait">
            {resultImage ? (
              <motion.div 
                key="result"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="w-full max-w-md space-y-6"
              >
                <div className="bg-white p-4 border-2 border-black rounded-2xl shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] overflow-hidden">
                  <img 
                    src={resultImage} 
                    alt="Generated cartoon" 
                    className="w-full h-auto rounded-lg"
                  />
                </div>
                
                <div className="flex gap-4">
                  <button 
                    onClick={downloadImage}
                    className="flex-1 py-3 bg-white border-2 border-black font-bold uppercase text-sm rounded-xl flex items-center justify-center gap-2 hover:bg-[#00FF00] transition-colors"
                  >
                    <Download className="w-4 h-4" /> Download
                  </button>
                  <button 
                    onClick={() => setResultImage(null)}
                    className="px-6 py-3 bg-black text-white font-bold uppercase text-sm rounded-xl hover:bg-zinc-800 transition-colors"
                  >
                    New
                  </button>
                </div>

                {/* Refinement Area */}
                <div className="pt-6 border-t border-black/10 space-y-3">
                   <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-[#00FF00]" />
                    <h3 className="text-xs font-black uppercase tracking-widest">Refine Result</h3>
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="e.g. 'Make the hat blue' or 'Add a smile'"
                      value={refinementPrompt}
                      onChange={(e) => setRefinementPrompt(e.target.value)}
                      className="flex-1 px-4 py-3 border-2 border-black rounded-xl text-sm font-medium focus:ring-2 focus:ring-[#00FF00] outline-none bg-white"
                    />
                    <button 
                      onClick={refineImage}
                      disabled={isRefining || !refinementPrompt.trim()}
                      className="px-6 py-3 bg-[#00FF00] border-2 border-black rounded-xl font-black uppercase text-xs shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                      {isRefining ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Apply"}
                    </button>
                  </div>
                </div>
              </motion.div>
            ) : isGenerating ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-6"
              >
                <div className="relative w-24 h-24 mx-auto">
                  <div className="absolute inset-0 border-4 border-black rounded-full animate-[spin_3s_linear_infinite]" />
                  <div className="absolute inset-0 border-4 border-t-[#00FF00] rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <ImageIcon className="w-8 h-8 animate-pulse" />
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="font-black uppercase tracking-widest text-xl">Crafting your toon...</p>
                  <p className="text-sm opacity-60 italic">Applying style vectors and line work</p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center max-w-xs space-y-4"
              >
                <div className="w-20 h-20 bg-white border-2 border-black rounded-3xl mx-auto flex items-center justify-center rotate-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                  <ImageIcon className="w-10 h-10 opacity-20" />
                </div>
                <div>
                  <p className="font-bold text-lg">Your creation will appear here</p>
                  <p className="text-sm opacity-50">Upload a style and describe your subject to begin the magic.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Decorative elements */}
          <div className="absolute top-4 right-4 opacity-10 pointer-events-none">
            <Type className="w-32 h-32" />
          </div>
          <div className="absolute bottom-4 left-4 opacity-10 pointer-events-none">
            <Palette className="w-32 h-32" />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-black p-6 bg-white text-center">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-40">
          Powered by Gemini 2.5 Flash Image • Built with AI Studio
        </p>
      </footer>
    </div>
  );
}
