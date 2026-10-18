import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field, Modal } from '../components/ui.jsx';
import { dateTime, LABELS } from '../format.js';

/** Création ou modification d'un administrateur (nom, e-mail de connexion, rôle, mot de passe). */
function AdminForm({ admin, isSelf, onDone }) {
  const qc = useQueryClient();
  const [f, setF] = useState(admin ? { email: admin.email, full_name: admin.full_name, role: admin.role, password: '' } : { email: '', full_name: '', role: 'admin', password: '' });
  const m = useMutation({
    mutationFn: () =>
      admin
        ? api.patch(`/admin/admins/${admin.id}`, {
            full_name: f.full_name !== admin.full_name ? f.full_name : undefined,
            email: f.email !== admin.email ? f.email : undefined,
            role: f.role !== admin.role ? f.role : undefined,
            password: f.password || undefined
          })
        : api.post('/admin/admins', f),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admins'] });
      onDone();
    }
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <div className="form-row">
        <Field label="Nom complet" id="a-fn"><input id="a-fn" className="input" required value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="E-mail (login)" id="a-em"><input id="a-em" className="input" type="email" required value={f.email} onChange={set('email')} /></Field>
      </div>
      <div className="form-row">
        <Field label="Rôle" id="a-ro">
          <select id="a-ro" className="input" value={f.role} onChange={set('role')} disabled={isSelf}>
            {Object.entries(LABELS.role).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label={admin ? 'Nouveau mot de passe (facultatif)' : 'Mot de passe initial (10 car. min.)'} id="a-pw">
          <input id="a-pw" className="input" type="password" minLength={10} required={!admin} value={f.password} onChange={set('password')} autoComplete="new-password" />
        </Field>
      </div>
      {admin && f.password ? <p className="muted small" style={{ margin: 0 }}>Le nouveau mot de passe ferme toutes les sessions de cet administrateur.</p> : null}
      <button className="btn" type="submit" disabled={m.isPending}>{admin ? 'Enregistrer' : 'Créer le compte'}</button>
    </form>
  );
}

export function Admins() {
  const qc = useQueryClient();
  const { admin: me } = useAuth();
  const [modal, setModal] = useState(null);
  const { data, error } = useQuery({ queryKey: ['admins'], queryFn: () => api.get('/admin/admins') });
  const act = useMutation({
    mutationFn: (fn) => fn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admins'] })
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Administrateurs</h1>
          <p>Équipe gaRAN et accès des forces de l’ordre (consultation des historiques IMEI).</p>
        </div>
        <button className="btn" type="button" onClick={() => setModal({})}>Nouveau compte</button>
      </div>
      <ErrorBox error={error || act.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>E-mail (login)</th><th>Rôle</th><th>Dernière connexion</th><th /></tr></thead>
          <tbody>
            {data?.items.map((a) => {
              const isSelf = a.id === me.id;
              return (
                <tr key={a.id}>
                  <td>{a.full_name} {isSelf ? <span className="badge info">Vous</span> : null} {a.status !== 'active' ? <span className="badge muted">Désactivé</span> : null}</td>
                  <td>{a.email}</td>
                  <td>{LABELS.role[a.role]}</td>
                  <td>{dateTime(a.last_login_at)}</td>
                  <td>
                    <div className="actions">
                      <button className="btn link small" type="button" onClick={() => setModal({ admin: a })}>Modifier</button>
                      {!isSelf ? (
                        <>
                          <button className="btn link small" type="button" onClick={() => act.mutate(() => api.patch(`/admin/admins/${a.id}`, { status: a.status === 'active' ? 'disabled' : 'active' }))}>
                            {a.status === 'active' ? 'Désactiver' : 'Réactiver'}
                          </button>
                          <button
                            className="btn link small danger"
                            type="button"
                            onClick={() => window.confirm(`Supprimer définitivement le compte de ${a.full_name} ?`) && act.mutate(() => api.del(`/admin/admins/${a.id}`))}
                          >
                            Supprimer
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {modal ? (
        <Modal title={modal.admin ? `Modifier ${modal.admin.full_name}` : 'Nouvel administrateur'} onClose={() => setModal(null)}>
          <AdminForm admin={modal.admin} isSelf={modal.admin?.id === me.id} onDone={() => setModal(null)} />
        </Modal>
      ) : null}
    </>
  );
}
