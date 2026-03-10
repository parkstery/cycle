import React, { useEffect } from "react";
import { ChevronRight, ChevronDown, ChevronLeft, X } from "lucide-react";

const APP_NAME = "Ride the World – Indoor Cycling";

export type MenuView =
  | "list"
  | "help"
  | "privacy"
  | "terms"
  | "disclaimer"
  | "licenses"
  | "contact";

interface MenuPanelProps {
  open: boolean;
  onClose: () => void;
  onOpenAbout: () => void;
  menuView: MenuView;
  setMenuView: (v: MenuView) => void;
  legalExpanded: boolean;
  setLegalExpanded: (v: boolean) => void;
}

export default function MenuPanel({
  open,
  onClose,
  onOpenAbout,
  menuView,
  setMenuView,
  legalExpanded,
  setLegalExpanded,
}: MenuPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!open) return null;

  const isList = menuView === "list";

  const backToMenu = () => {
    setMenuView("list");
  };

  const viewMap = {
    help: <HelpContent />,
    privacy: <PrivacyContent />,
    terms: <TermsContent />,
    disclaimer: <DisclaimerContent />,
    licenses: <LicensesContent />,
    contact: <ContactContent />,
  };

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-[10001] bg-black/40"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* panel */}
      <div
        className="fixed left-0 top-0 bottom-0 z-[10002] w-[88%] max-w-[360px] bg-white shadow-2xl flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* navigation */}
        <header className="border-b border-slate-200">

          <div className="flex items-center justify-between px-4 h-10 text-sm">

            <button
              onClick={backToMenu}
              className="flex items-center gap-1 text-slate-700"
            >
              <ChevronLeft size={18} />
              Back to Menu
            </button>

            <button
              onClick={onClose}
              className="flex items-center gap-1 text-slate-700"
            >
              Back to Simulator
              <X size={18} />
            </button>

          </div>

          <div className="h-12 flex items-center px-4 font-semibold text-slate-900">
            {isList ? "Menu" : "Information"}
          </div>

        </header>

        {/* content */}
        <div className="flex-1 overflow-y-auto">

          {isList ? (
            <ul className="py-2 text-slate-800">

              <li>
                <button
                  onClick={() => {
                    onOpenAbout();
                    onClose();
                  }}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  About
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              <li>
                <button
                  onClick={() => setMenuView("help")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Help
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

              {/* legal section */}

              <li>
                <button
                  onClick={() => setLegalExpanded(!legalExpanded)}
                  aria-expanded={legalExpanded}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Legal
                  {legalExpanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} className="text-slate-400" />
                  )}
                </button>

                {legalExpanded && (
                  <ul className="ml-6 border-l border-slate-200">

                    {[
                      { key: "privacy", label: "Privacy Policy" },
                      { key: "terms", label: "Terms of Service" },
                      { key: "disclaimer", label: "Disclaimer" },
                      { key: "licenses", label: "Open Source Licenses" },
                    ].map(({ key, label }) => (
                      <li key={key}>
                        <button
                          onClick={() => setMenuView(key as MenuView)}
                          className="w-full text-left pl-4 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100"
                        >
                          {label}
                        </button>
                      </li>
                    ))}

                  </ul>
                )}
              </li>

              <li>
                <button
                  onClick={() => setMenuView("contact")}
                  className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
                >
                  Contact
                  <ChevronRight size={18} className="text-slate-400" />
                </button>
              </li>

            </ul>
          ) : (
            <div className="px-4 py-4 pb-8 text-sm text-slate-800 leading-relaxed">
              {viewMap[menuView as keyof typeof viewMap]}
            </div>
          )}

        </div>

        {/* footer */}

        <div className="px-4 py-3 border-t text-xs text-slate-500">
          {APP_NAME}
          <br />
          Version 1.0
        </div>

      </div>
    </>
  );
}