import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox } from '../components/ui.jsx';
import { num } from '../format.js';

export function Catalog() {
  const { can } = useAuth();
  const staff = can('superadmin', 'admin');
  const qc = useQueryClient();
  const [brandId, setBrandId] = useState(null);
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');

  const brands = useQuery({ queryKey: ['admin-brands'], queryFn: () => api.get('/admin/catalog/brands') });
  const current = brands.data?.items.find((b) => b.id === brandId) ?? brands.data?.items[0];
  const models = useQuery({
    queryKey: ['admin-models', current?.id],
    queryFn: () => api.get('/admin/catalog/models', { brand_id: current.id }),
    enabled: Boolean(current)
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['admin-brands'] });
    qc.invalidateQueries({ queryKey: ['admin-models'] });
  };
  const addBrand = useMutation({ mutationFn: () => api.post('/admin/catalog/brands', { name: newBrand }), onSuccess: () => { setNewBrand(''); refresh(); } });
  const addModel = useMutation({ mutationFn: () => api.post('/admin/catalog/models', { brand_id: current.id, name: newModel }), onSuccess: () => { setNewModel(''); refresh(); } });
  const toggleBrand = useMutation({ mutationFn: (b) => api.patch(`/admin/catalog/brands/${b.id}`, { active: !b.active }), onSuccess: refresh });
  const toggleModel = useMutation({ mutationFn: (m) => api.patch(`/admin/catalog/models/${m.id}`, { active: !m.active }), onSuccess: refresh });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Marques & modèles</h1>
          <p>Référentiel proposé aux boutiques lors des ventes et des rachats.</p>
        </div>
      </div>
      <ErrorBox error={brands.error || addBrand.error || addModel.error || toggleBrand.error || toggleModel.error} />
      <div className="two-col" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2>Marques</h2>
          {staff ? (
            <form className="toolbar" style={{ marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); if (newBrand.trim()) addBrand.mutate(); }}>
              <input className="input" placeholder="Nouvelle marque" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} aria-label="Nouvelle marque" />
              <button className="btn" type="submit" disabled={addBrand.isPending}>Ajouter</button>
            </form>
          ) : null}
          <table>
            <tbody>
              {brands.data?.items.map((b) => (
                <tr key={b.id} style={{ background: current?.id === b.id ? 'var(--blue-50)' : undefined }}>
                  <td>
                    <button type="button" className="btn secondary small" style={{ border: 0, background: 'transparent' }} onClick={() => setBrandId(b.id)}>
                      <strong>{b.name}</strong>
                    </button>
                    {!b.active ? <span className="badge muted">Masquée</span> : null}
                  </td>
                  <td className="num muted">{num(b.models_count)} modèles</td>
                  {staff ? <td className="num"><button className="btn secondary small" type="button" onClick={() => toggleBrand.mutate(b)}>{b.active ? 'Masquer' : 'Afficher'}</button></td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2>Modèles {current ? `— ${current.name}` : ''}</h2>
          {staff && current ? (
            <form className="toolbar" style={{ marginBottom: 12 }} onSubmit={(e) => { e.preventDefault(); if (newModel.trim()) addModel.mutate(); }}>
              <input className="input" placeholder={`Nouveau modèle ${current.name}`} value={newModel} onChange={(e) => setNewModel(e.target.value)} aria-label="Nouveau modèle" />
              <button className="btn" type="submit" disabled={addModel.isPending}>Ajouter</button>
            </form>
          ) : null}
          <table>
            <tbody>
              {models.data?.items.map((m) => (
                <tr key={m.id}>
                  <td>{m.name} {!m.active ? <span className="badge muted">Masqué</span> : null}</td>
                  <td className="num muted">{num(m.devices_count)} appareils</td>
                  {staff ? <td className="num"><button className="btn secondary small" type="button" onClick={() => toggleModel.mutate(m)}>{m.active ? 'Masquer' : 'Afficher'}</button></td> : null}
                </tr>
              ))}
              {models.data && !models.data.items.length ? <tr><td className="empty">Aucun modèle</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
