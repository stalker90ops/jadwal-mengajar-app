"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface SearchableOption {
  value: string;
  label: string;
  subLabel?: string;
  badge?: string;
}

interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  required?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  openDirection?: "auto" | "down" | "up";
  size?: "sm" | "md";
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "-- Pilih --",
  searchPlaceholder = "Ketik untuk mencari...",
  disabled = false,
  className = "",
  buttonClassName = "",
  allowClear = false,
  clearLabel,
  required = false,
  openDirection = "auto",
  size = "md",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Deteksi arah dropdown (atas atau bawah) secara dinamis
  useEffect(() => {
    if (isOpen) {
      if (openDirection === "up") {
        setDropUp(true);
      } else if (openDirection === "down") {
        setDropUp(false);
      } else if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        if (spaceBelow < 260 && spaceAbove > spaceBelow) {
          setDropUp(true);
        } else {
          setDropUp(false);
        }
      }
    }
  }, [isOpen, openDirection]);

  // Cari objek opsi yang sedang terpilih
  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  // Filter opsi berdasarkan search term (case-insensitive)
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const term = searchTerm.toLowerCase();
    return options.filter((opt) => {
      const matchLabel = opt.label.toLowerCase().includes(term);
      const matchSub = opt.subLabel?.toLowerCase().includes(term) ?? false;
      const matchBadge = opt.badge?.toLowerCase().includes(term) ?? false;
      return matchLabel || matchSub || matchBadge;
    });
  }, [options, searchTerm]);

  // Handle click outside untuk menutup dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Auto focus input pencarian ketika dropdown terbuka
  useEffect(() => {
    if (isOpen) {
      setSearchTerm("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div ref={containerRef} className={`relative ${isOpen ? "z-40" : ""} ${className}`}>
      {/* Hidden input for HTML form validation */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required={required}
          value={value}
          onChange={() => {}}
          className="absolute inset-0 opacity-0 pointer-events-none w-full h-full -z-10"
        />
      )}
      {/* Tombol Utama Pembuka Select */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={`w-full flex items-center justify-between border rounded-lg transition-all cursor-pointer select-none ${
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-2 text-sm"
        } ${
          disabled
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            : isOpen
            ? "border-blue-500 ring-2 ring-blue-500/20 shadow-sm bg-white"
            : buttonClassName || "bg-white border-slate-300 hover:border-slate-400"
        }`}
      >
        <div className="flex items-center gap-2 truncate flex-1 min-w-0 pr-1">
          {selectedOption ? (
            <div className="flex items-center gap-1.5 truncate">
              {selectedOption.badge && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-700 rounded border border-slate-200">
                  {selectedOption.badge}
                </span>
              )}
              <span className="font-medium text-slate-900 truncate">
                {selectedOption.label}
              </span>
              {selectedOption.subLabel && (
                <span className="text-xs text-slate-400 truncate">
                  ({selectedOption.subLabel})
                </span>
              )}
            </div>
          ) : (
            <span className={`truncate ${!buttonClassName ? "text-slate-400" : ""}`}>
              {placeholder}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1 text-slate-400">
          {allowClear && selectedOption && !disabled && (
            <span
              role="button"
              onClick={handleClear}
              className="p-0.5 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors"
              title="Hapus pilihan"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown
            className={`${size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} transition-transform duration-200 ${
              isOpen ? "rotate-180 text-blue-600" : ""
            }`}
          />
        </div>
      </div>

      {/* Floating Dropdown Menu dengan Search Bar */}
      {isOpen && (
        <div
          className={`absolute left-0 min-w-[260px] w-full ${
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          } z-50 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100`}
        >
          {/* Input Pencarian */}
          <div className="p-2 border-b border-slate-100 bg-slate-50/70">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-slate-800 placeholder:text-slate-400"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsOpen(false);
                  } else if (e.key === "Enter" && filteredOptions.length > 0) {
                    e.preventDefault();
                    handleSelect(filteredOptions[0].value);
                  }
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <div className="flex items-center justify-between px-1 pt-1.5 text-[10px] text-slate-400">
              <span>{filteredOptions.length} hasil ditemukan</span>
              <span className="italic">Tekan Enter untuk memilih pertama</span>
            </div>
          </div>

          {/* List Opsi */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate-50 p-1">
            {allowClear && (
              <div
                role="button"
                onClick={() => handleSelect("")}
                className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors ${
                  !value
                    ? "bg-blue-50 text-blue-700 font-semibold"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <span>{clearLabel || placeholder}</span>
                {!value && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </div>
            )}

            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Tidak ada data &quot;{searchTerm}&quot; ditemukan.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    role="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50 text-blue-700 font-bold"
                        : "text-slate-800 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {opt.badge && (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${
                            isSelected
                              ? "bg-blue-200/60 text-blue-800"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {opt.badge}
                        </span>
                      )}
                      <div className="truncate">
                        <span className="font-medium">{opt.label}</span>
                        {opt.subLabel && (
                          <span className="text-[11px] text-slate-400 ml-1.5 font-normal">
                            {opt.subLabel}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
