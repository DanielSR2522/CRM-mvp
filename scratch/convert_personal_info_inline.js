const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// Replace Personal Information Header section to remove section-level Edit Info button
const headerOld = `<div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <h3 className="text-lg font-extrabold text-slate-900">Personal Information</h3>
                      {!isEditingPersonal ? (
                        <button
                          onClick={() => setIsEditingPersonal(true)}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg transition-all"
                        >
                          Edit Info
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setIsEditingPersonal(false);
                              setPersonalError(null);
                            }}
                            className="text-xs font-bold text-slate-500 hover:text-slate-700 bg-slate-50 px-3 py-1.5 rounded-lg transition-all"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSavePersonal}
                            disabled={savingPersonal}
                            className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-all shadow-md disabled:opacity-50"
                          >
                            {savingPersonal ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      )}
                    </div>`;

const headerNew = `<div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
                      <div>
                        <h3 className="text-lg font-extrabold text-slate-900">Personal Information</h3>
                        <p className="text-xs text-slate-400 mt-0.5">Click any field to edit directly.</p>
                      </div>
                    </div>`;

content = content.replace(headerOld, headerNew);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Removed section-level Edit Info button header!');
