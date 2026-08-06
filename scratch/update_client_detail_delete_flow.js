const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/app/clients/[id]/page.tsx');
let content = fs.readFileSync(targetFile, 'utf-8');

// 1. Ensure getClientDeletionSummaryAction and ClientDeletionSummary are imported
if (!content.includes('getClientDeletionSummaryAction')) {
  content = content.replace(
    "import { deleteClientSecure } from '@/app/actions/deleteClientAction';",
    "import { deleteClientSecure, getClientDeletionSummaryAction, ClientDeletionSummary } from '@/app/actions/deleteClientAction';"
  );
}

// 2. Add state for deletion summary inside ClientProfilePage
const summaryState = `  // Deletion Summary State
  const [deletionSummary, setDeletionSummary] = useState<ClientDeletionSummary | null>(null);
  const [loadingDeletionSummary, setLoadingDeletionSummary] = useState<boolean>(false);`;

if (!content.includes('const [deletionSummary, setDeletionSummary]')) {
  content = content.replace(
    "const [isDeletingClient, setIsDeletingClient] = useState(false);",
    `const [isDeletingClient, setIsDeletingClient] = useState(false);\n${summaryState}`
  );
}

// 3. Update Danger Zone button click handler to fetch summary
const oldOpenBtn = `onClick={() => {
              setDeleteClientError(null);
              setIsDeleteClientModalOpen(true);
            }}`;

const newOpenBtn = `onClick={async () => {
              setDeleteClientError(null);
              setIsDeleteClientModalOpen(true);
              setLoadingDeletionSummary(true);
              try {
                const { data: sessionData } = await supabase.auth.getSession();
                const token = sessionData.session?.access_token || '';
                const summaryRes = await getClientDeletionSummaryAction(clientId, token);
                if (summaryRes.success && summaryRes.summary) {
                  setDeletionSummary(summaryRes.summary);
                }
              } catch (err) {
                console.error('Failed to load deletion summary:', err);
              } finally {
                setLoadingDeletionSummary(false);
              }
            }}`;

content = content.replace(oldOpenBtn, newOpenBtn);

// 4. Replace Delete Client Modal JSX with updated warnings & "Delete Everything" button
const oldModalJSX = content.substring(
  content.indexOf("{/* Delete Client Modal */}"),
  content.indexOf("{/* Add Income Modal */}")
);

const newModalJSX = `{/* Delete Client Modal */}
      {isDeleteClientModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 md:p-8 w-full max-w-lg shadow-2xl animate-scale-up border border-slate-100 space-y-5">
            <div>
              <h3 className="text-xl font-extrabold text-rose-600">Delete Client Profile</h3>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                This will permanently delete the client and all associated data across all modules.
              </p>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Target Client</span>
              <span className="text-base font-extrabold text-slate-900">{personalForm.full_name || client?.full_name || 'Client Profile'}</span>
            </div>

            {/* Informational Warning Summary */}
            {loadingDeletionSummary ? (
              <div className="flex justify-center items-center py-6">
                <svg className="animate-spin h-6 w-6 text-rose-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : deletionSummary ? (
              <div className="bg-amber-50 border border-amber-200/80 rounded-xl p-4 space-y-2">
                <span className="block text-xs font-extrabold text-amber-800 uppercase tracking-wider">Permanent Deletion Warning</span>
                <ul className="text-xs text-amber-900 font-medium space-y-1.5 list-disc list-inside">
                  {deletionSummary.signed_consents_count > 0 && (
                    <li>This client has <strong>{deletionSummary.signed_consents_count}</strong> signed consent(s).</li>
                  )}
                  {deletionSummary.pending_signatures_count > 0 && (
                    <li>This client has <strong>{deletionSummary.pending_signatures_count}</strong> pending signature request(s).</li>
                  )}
                  {deletionSummary.uploaded_files_count > 0 && (
                    <li>This client has <strong>{deletionSummary.uploaded_files_count}</strong> uploaded document(s).</li>
                  )}
                  {(deletionSummary.health_policies_count + deletionSummary.pc_policies_count) > 0 && (
                    <li>This client has <strong>{deletionSummary.health_policies_count + deletionSummary.pc_policies_count}</strong> active policy / policies.</li>
                  )}
                  {deletionSummary.notes_count > 0 && (
                    <li>This client has <strong>{deletionSummary.notes_count}</strong> note(s).</li>
                  )}
                  <li>All related database records, policies, consents, and files will be permanently deleted.</li>
                </ul>
              </div>
            ) : null}

            {deleteClientError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-xs font-semibold">
                {deleteClientError}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteClientModalOpen(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
                disabled={isDeletingClient}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteClient}
                disabled={isDeletingClient}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 shadow-md shadow-rose-500/20 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDeletingClient ? 'Deleting Everything...' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </div>
      )}

      `;

content = content.replace(oldModalJSX, newModalJSX);

fs.writeFileSync(targetFile, content, 'utf-8');
console.log('Successfully updated Delete Client modal UI in page.tsx!');
