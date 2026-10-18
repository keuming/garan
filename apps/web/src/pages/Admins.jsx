import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { ErrorBox, Field, Modal } from '../components/ui.jsx';
import { dateTime, LABELS } from '../format.js';

function CreateAdmin({ onDone }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ email: '', full_name: '', role: 'admin', password: '' });
  const m = useMutation({
    mutationFn: () => api.post('/admin/admins', f),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admins'] }); onDone(); }
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ErrorBox error={m.error} />
      <Field label="Nom complet" id="fn"><input id="fn" className="input" required value={f.full_name} onChange={set('full_name')} /></Field>
      <Field label="E-mail" id="em"><input id="em" className="input" type="email" required value={f.email} onChange={set('email')} /></Field>
      <div className="form-row">
        <Field label="Rôle" id="ro">
          <select id="ro" className="input" value={f.role} onChange={set('role')}>
            {Object.entries(LABELS.role).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Mot de passe initial (10 car. min.)" id="pw"><input id="pw" className="input" type="password" minLength={10} required value={f.password} onChange={set('password')} autoComplete="new-password" /></Field>
      </div>
      <button className="btn" type="submit" disabled={m.isPending}>Créer le compte</button>
    </form>
  );
}

export function Admins() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, error } = useQuery({ queryKey: ['admins'], queryFn: () => api.get('/admin/admins') });
  const toggle = useMutation({
    mutationFn: (a) => api.patch(`/admin/admins/${a.id}`, { status: a.status === 'active' ? 'disabled' : 'active' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admins'] })
  });
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Administrateurs</h1>
          <p>Équipe gaRAN et accès des forces de l’ordre (consultation des historiques IMEI).</p>
        </div>
        <button className="btn" type="button" onClick={() => setOpen(true)}>Nouveau compte</button>
      </div>
      <ErrorBox error={error || toggle.error} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Dernière connexion</th><th /></tr></thead>
          <tbody>
            {data?.items.map((a) => (
              <tr key={a.id}>
                <td>{a.full_name} {a.status !== 'active' ? <span className="badge muted">Désactivé</span> : null}</td>
                <td>{a.email}</td>
                <td>{LABELS.role[a.role]}</td>
                <td>{dateTime(a.last_login_at)}</td>
                <td className="num"><button className="btn secondary small" type="button" onClick={() => toggle.mutate(a)}>{a.status === 'active' ? 'Désactiver' : 'Réactiver'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? <Modal title="Nouvel administrateur" onClose={() => setOpen(false)}><CreateAdmin onDone={() => setOpen(false)} /></Modal> : null}
    </>
  );
}
