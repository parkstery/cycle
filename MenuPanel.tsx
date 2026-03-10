{/* content */}
<div className="flex-1 overflow-y-auto">

{isList ? (
  <ul className="py-2 text-slate-800 list-none pl-0">

    {/* About */}
    <li>
      <button
        onClick={() => setMenuView("about")}
        className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
      >
        About
        <ChevronRight size={18} className="text-slate-400" />
      </button>
    </li>

    {/* Guide group */}
    <li className="pt-2">

      <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Guide
      </div>

      <ul className="border-l-2 border-slate-200 ml-4 pl-4 my-1 list-none">

        <li>
          <button
            onClick={() => setMenuView("guideSimple")}
            className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
          >
            Quick Guide
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        </li>

        <li>
          <button
            onClick={() => setMenuView("guideDetail")}
            className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
          >
            Detailed Guide
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        </li>

      </ul>
    </li>

    {/* Settings */}
    <li>
      <button
        onClick={() => setMenuView("settings")}
        className="w-full text-left px-4 py-3 font-medium hover:bg-slate-100 flex items-center justify-between"
      >
        Settings
        <ChevronRight size={18} className="text-slate-400" />
      </button>
    </li>

    {/* Legal group */}
    <li className="pt-2">

      <div className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Legal
      </div>

      <ul className="border-l-2 border-slate-200 ml-4 pl-4 my-1 list-none">

        <li>
          <button
            onClick={() => setMenuView("privacy")}
            className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
          >
            Privacy Policy
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        </li>

        <li>
          <button
            onClick={() => setMenuView("terms")}
            className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
          >
            Terms of Service
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        </li>

        <li>
          <button
            onClick={() => setMenuView("disclaimer")}
            className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
          >
            Disclaimer
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        </li>

        <li>
          <button
            onClick={() => setMenuView("licenses")}
            className="w-full text-left pl-2 pr-4 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-center justify-between"
          >
            Open Source Licenses
            <ChevronRight size={18} className="text-slate-400" />
          </button>
        </li>

      </ul>
    </li>

    {/* Contact */}
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

  <div className="px-4 py-4 pb-8 text-slate-800 leading-relaxed overflow-y-auto">
    {viewMap[menuView]}
  </div>

)}

</div>