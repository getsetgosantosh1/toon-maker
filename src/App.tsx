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

interface SavedPerson {
  id: string;
  name: string;
  images: ImageState[];
}

export default function App() {
  const [styleImages, setStyleImages] = useState<ImageState[]>([]);
  const [currentSubjectImages, setCurrentSubjectImages] = useState<ImageState[]>([]);
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [styleName, setStyleName] = useState("");
  const [savedStyles, setSavedStyles] = useState<SavedStyle[]>([]);
  const [personName, setPersonName] = useState("");
  const [savedPersons, setSavedPersons] = useState<SavedPerson[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<string[]>([]);
  const [refinementPrompt, setRefinementPrompt] = useState("");

  const styleInputRef = useRef<HTMLInputElement>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

  // Load saved data from local storage
  useEffect(() => {
    const storedStyles = localStorage.getItem("toonstyle_saved_styles");
    if (storedStyles) {
      try { setSavedStyles(JSON.parse(storedStyles)); } catch (e) { console.error(e); }
    }
    const storedPersons = localStorage.getItem("toonstyle_saved_persons");
    if (storedPersons) {
      try { setSavedPersons(JSON.parse(storedPersons)); } catch (e) { console.error(e); }
    }
  }, []);

  // Save styles to local storage
  const saveStyle = () => {
    if (!styleName.trim() || styleImages.length === 0) return;
    const newStyle: SavedStyle = {
      id: Date.now().toString(),
      name: styleName.trim(),
      images: [...styleImages]
    };
    const updated = [newStyle, ...savedStyles];
    setSavedStyles(updated);
    localStorage.setItem("toonstyle_saved_styles", JSON.stringify(updated));
    setStyleName("");
  };

  // Save persons to local storage
  const savePerson = () => {
    if (!personName.trim() || currentSubjectImages.length === 0) return;
    const newPerson: SavedPerson = {
      id: Date.now().toString(),
      name: personName.trim(),
      images: [...currentSubjectImages]
    };
    const updated = [newPerson, ...savedPersons];
    setSavedPersons(updated);
    localStorage.setItem("toonstyle_saved_persons", JSON.stringify(updated));
    setPersonName("");
    setCurrentSubjectImages([]);
  };

  const deleteStyle = (id: string) => {
    const updated = savedStyles.filter(s => s.id !== id);
    setSavedStyles(updated);
    localStorage.setItem("toonstyle_saved_styles", JSON.stringify(updated));
  };

  const deletePerson = (id: string) => {
    const updated = savedPersons.filter(p => p.id !== id);
    setSavedPersons(updated);
    localStorage.setItem("toonstyle_saved_persons", JSON.stringify(updated));
    setSelectedPersonIds(prev => prev.filter(pid => pid !== id));
  };

  const loadStyle = (style: SavedStyle) => {
    setStyleImages(style.images);
  };

  const togglePersonSelection = (id: string) => {
    setSelectedPersonIds(prev => 
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "style" | "subject"
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
          setCurrentSubjectImages(prev => [...prev, state]);
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
    
    const selectedPersonsData = savedPersons.filter(p => selectedPersonIds.includes(p.id));
    const hasSubjects = currentSubjectImages.length > 0 || selectedPersonsData.length > 0;

    if (!prompt && !hasSubjects) {
      setError("Please provide a description or at least one subject.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const model = "gemini-2.5-flash-image";
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
      
      const parts: any[] = styleImages.map(img => ({
        inlineData: {
          data: img.base64,
          mimeType: img.mimeType,
        },
      }));

      // Add current ad-hoc subject images
      currentSubjectImages.forEach(img => {
        parts.push({
          inlineData: {
            data: img.base64,
            mimeType: img.mimeType,
          },
        });
      });

      // Add selected saved persons' images
      selectedPersonsData.forEach(person => {
        person.images.forEach(img => {
          parts.push({
            inlineData: {
              data: img.base64,
              mimeType: img.mimeType,
            },
          });
        });
      });

      const styleCount = styleImages.length;
      const styleRef = styleCount > 1 
        ? `the artistic styles, color palettes, and aesthetics synthesized from the first ${styleCount} reference images`
        : `the artistic style, color palette, and aesthetic of the first style image`;

      let subjectRef = "";
      if (selectedPersonsData.length > 0 || currentSubjectImages.length > 0) {
        const names = selectedPersonsData.map(p => p.name);
        if (currentSubjectImages.length > 0) names.push("the person shown in the additional subject images");
        subjectRef = ` featuring ${names.join(" and ")}. Ensure each person's unique features from their reference images are accurately captured in the cartoon style.`;
      }

      const fullPrompt = `Create a cartoon/caricature strictly following ${styleRef}${subjectRef}. ${prompt}`;

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
              <div className="flex gap-2 pt-2">
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
                  <Save className="w-3 h-3" /> Save
                </button>
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
                        className="px-3 py-1.5 bg-white border border-black rounded-full text-[10px] font-bold uppercase hover:bg-[#00FF00] transition-all flex items-center gap-2"
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

          {/* Step 2: Subjects */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="bg-black text-white px-2 py-0.5 text-xs font-bold">02</span>
                <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
                  <User className="w-4 h-4" /> Subjects & Prompt
                </h2>
              </div>
              <span className="text-[10px] font-mono opacity-50 uppercase">
                {currentSubjectImages.length + selectedPersonIds.length} Active
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Current Subject Uploads */}
              <div className="space-y-3">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {currentSubjectImages.map((img, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      key={idx}
                      className="relative aspect-square border-2 border-black rounded-xl overflow-hidden group shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                    >
                      <img 
                        src={`data:${img.mimeType};base64,${img.base64}`} 
                        className="w-full h-full object-cover"
                        alt={`Subject ${idx + 1}`}
                      />
                      <button 
                        onClick={() => setCurrentSubjectImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 p-1 bg-white border border-black rounded-full hover:bg-[#FF0000] hover:text-white transition-colors"
                      >
                        <X className="w-2 h-2" />
                      </button>
                    </motion.div>
                  ))}
                  <button 
                    onClick={() => subjectInputRef.current?.click()}
                    className="aspect-square border-2 border-dashed border-black rounded-xl bg-[#F9F9F9] hover:bg-[#F0F0F0] transition-all flex flex-col items-center justify-center gap-1 group"
                  >
                    <Upload className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    <span className="text-[8px] font-bold uppercase">Add Person</span>
                    <input 
                      type="file" 
                      ref={subjectInputRef} 
                      className="hidden" 
                      accept="image/*" 
                      multiple
                      onChange={(e) => handleImageUpload(e, "subject")}
                    />
                  </button>
                </div>

                {currentSubjectImages.length > 0 && (
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      placeholder="Person's Name"
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-black rounded-lg text-xs font-medium focus:ring-1 focus:ring-[#00FF00] outline-none"
                    />
                    <button 
                      onClick={savePerson}
                      disabled={!personName.trim()}
                      className="px-3 py-2 bg-black text-white rounded-lg hover:bg-zinc-800 disabled:opacity-30 transition-all flex items-center gap-2 text-xs font-bold uppercase"
                    >
                      <Save className="w-3 h-3" /> Save Person
                    </button>
                  </div>
                )}
              </div>

              {/* Saved Persons Library */}
              {savedPersons.length > 0 && (
                <div className="pt-2">
                  <h3 className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-3">Saved Persons</h3>
                  <div className="flex flex-wrap gap-2">
                    {savedPersons.map(person => (
                      <div key={person.id} className="group relative">
                        <button 
                          onClick={() => togglePersonSelection(person.id)}
                          className={cn(
                            "px-3 py-1.5 border border-black rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-2",
                            selectedPersonIds.includes(person.id) ? "bg-[#00FF00] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]" : "bg-white hover:bg-[#F0F0F0]"
                          )}
                        >
                          <User className="w-3 h-3" /> {person.name}
                        </button>
                        <button 
                          onClick={() => deletePerson(person.id)}
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
                  placeholder="Describe the scene... (e.g. 'The two people are having a picnic in a park')"
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
              disabled={isGenerating || styleImages.length === 0 || (!prompt && currentSubjectImages.length === 0 && selectedPersonIds.length === 0)}
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
