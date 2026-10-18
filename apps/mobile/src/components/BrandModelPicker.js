import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Input, Select } from './ui';

const OTHER = -1;

/** Choix marque → modèle depuis le référentiel ; « Autre modèle » permet une saisie libre. */
export function BrandModelPicker({ value, onChange, errors = {} }) {
  const brands = useQuery({ queryKey: ['brands'], queryFn: () => api.get('/catalog/brands'), staleTime: 3_600_000 });
  const models = useQuery({
    queryKey: ['models', value.brand_id],
    queryFn: () => api.get('/catalog/models', { brand_id: value.brand_id }),
    enabled: Boolean(value.brand_id),
    staleTime: 3_600_000
  });

  const brandOptions = (brands.data?.items ?? []).map((b) => ({ value: b.id, label: b.name }));
  const modelOptions = [
    ...(models.data?.items ?? []).map((m) => ({ value: m.id, label: m.name })),
    { value: OTHER, label: 'Autre modèle (saisie libre)' }
  ];
  const modelValue = value.model_id ?? (value.model_label !== undefined && value.model_label !== null ? OTHER : undefined);

  return (
    <View style={{ gap: 12 }}>
      <Select
        label="Marque"
        searchable
        value={value.brand_id}
        options={brandOptions}
        error={errors.brand_id}
        placeholder={brands.isLoading ? 'Chargement…' : 'Choisir la marque'}
        onChange={(id) => onChange({ ...value, brand_id: id, model_id: undefined, model_label: undefined })}
      />
      {value.brand_id ? (
        <Select
          label="Modèle"
          searchable
          value={modelValue}
          options={modelOptions}
          error={errors.model_id}
          placeholder="Choisir le modèle"
          onChange={(id) => onChange({ ...value, model_id: id === OTHER ? undefined : id, model_label: id === OTHER ? '' : undefined })}
        />
      ) : null}
      {modelValue === OTHER ? (
        <Input label="Nom du modèle" value={value.model_label ?? ''} onChangeText={(t) => onChange({ ...value, model_label: t })} placeholder="Ex. Galaxy A06" />
      ) : null}
    </View>
  );
}
