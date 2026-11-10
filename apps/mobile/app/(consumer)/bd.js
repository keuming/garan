import { useEffect, useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Card, Input, Loading, Muted, Screen, Segmented } from '../../src/components/ui';
import { api } from '../../src/lib/api';
import { colors } from '../../src/lib/theme';
import { date } from '../../src/lib/format';

const nf = (n) => new Intl.NumberFormat('fr-FR').format(Number(n) || 0);

const KIND_LABEL = {
  setup_consumer: 'Mise en service usager',
  subscription_consumer: 'Abonnement usager',
  setup_merchant: 'Mise en service marchand'
};
const REQ_STATUS = { pending: 'En attente', paid: 'Reversé', rejected: 'Refusé' };

function Tile({ label, due, total, bg }) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 16, padding: 16 }}>
      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: '#fff', fontSize: 26, fontWeight: '900', marginTop: 4 }}>{nf(due)} F</Text>
      <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11.5, marginTop: 2 }}>cumul {nf(total)} F</Text>
    </View>
  );
}

export default function BdSpace() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['consumer', 'bd-dashboard'],
    queryFn: () => api.get('/consumer/business-developer/dashboard')
  });

  const [method, setMethod] = useState('mobile_money');
  const [momo, setMomo] = useState('');
  const [orzayah, setOrzayah] = useState('');

  useEffect(() => {
    if (data?.payout_mobile_money) setMomo((m) => m || data.payout_mobile_money);
    if (data?.orzayah_account) setOrzayah((o) => o || data.orzayah_account);
  }, [data?.payout_mobile_money, data?.orzayah_account]);

  const saveOrzayah = useMutation({
    mutationFn: () => api.post('/consumer/business-developer/orzayah-account', { orzayah_account: orzayah }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['consumer', 'bd-dashboard'] }); Alert.alert('Compte ORZAYAH enregistré', 'Vous pourrez recevoir vos reversements sur ce compte.'); },
    onError: (e) => Alert.alert('Impossible', e?.message ?? 'Réessayez plus tard.')
  });

  const requestPayout = useMutation({
    mutationFn: () => api.post('/consumer/business-developer/payout-request', { method, mobile_money_number: method === 'mobile_money' ? momo : undefined }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['consumer', 'bd-dashboard'] }); await qc.invalidateQueries({ queryKey: ['consumer'] }); Alert.alert('Demande envoyée', 'Votre demande de reversement est en cours de traitement.'); },
    onError: (e) => Alert.alert('Impossible', e?.message ?? 'Réessayez plus tard.')
  });

  if (isLoading) return (<><Stack.Screen options={{ title: 'Mon espace BD' }} /><Loading /></>);

  if (!data || data.status !== 'active') {
    return (
      <>
        <Stack.Screen options={{ title: 'Mon espace BD' }} />
        <Screen>
          <Banner tone="info" title="Business Développeur">
            Votre espace sera disponible une fois votre compte Business Développeur activé.
          </Banner>
        </Screen>
      </>
    );
  }

  const s = data.stats ?? {};
  const due = s.due_fcfa ?? 0;
  const pending = data.pending_request;
  const canRequest = !pending && due > 0;

  const openUrl = (u) => Linking.openURL(u).catch(() => Alert.alert('Ouverture impossible', 'Aucune application disponible pour ouvrir ce lien.'));

  const code = data.promo_code;
  const inviteLink = `https://apps.garan.solutions/?code=${code}`;
  const inviteMsg = `Protège ton téléphone contre le vol avec gaRAN. Clique ici pour créer ton compte (ton code promo ${code} est déjà prérempli) : ${inviteLink}`;
  // Étape 1 : présenter le projet avant d'envoyer le code promo.
  const whyLink = 'https://apps.garan.solutions/why';
  const whyMsg = `Découvre gaRAN : le registre qui protège ton téléphone contre le vol et prouve que tu en es le propriétaire. Comprendre en 1 minute : ${whyLink}`;

  return (
    <>
      <Stack.Screen options={{ title: 'Mon espace BD' }} />
      <Screen refreshing={isFetching && !isLoading} onRefresh={refetch}>
        {/* Soldes */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
          <Tile label="Commission usager" due={s.consumer_due_fcfa ?? 0} total={s.consumer_total_fcfa ?? 0} bg={colors.green} />
          <Tile label="Commission marchand" due={s.merchant_due_fcfa ?? 0} total={s.merchant_total_fcfa ?? 0} bg={colors.navy} />
        </View>
        <Card style={{ alignItems: 'center', marginBottom: 12 }}>
          <Muted>Disponible à reverser</Muted>
          <Text style={{ fontSize: 30, fontWeight: '900', color: colors.ink }}>{nf(due)} FCFA</Text>
          <Text style={{ fontSize: 12, color: colors.ink3 }}>
            {s.usagers ?? 0} usagers · {s.marchands ?? 0} marchands · déjà reversé {nf(s.paid_fcfa ?? 0)} F
          </Text>
        </Card>

        {/* Étape 1 : présenter gaRAN au prospect */}
        <Card style={{ gap: 10, marginBottom: 12 }}>
          <Muted>Étape 1 — Faire connaître gaRAN</Muted>
          <Text style={{ color: colors.ink2, fontSize: 12.5 }}>
            Avant d’envoyer votre code promo, présentez le projet : partagez la page de présentation pour convaincre votre client ou prospect.
          </Text>
          <Button title="Partager la présentation (WhatsApp)" onPress={() => openUrl('https://wa.me/?text=' + encodeURIComponent(whyMsg))} />
          <Button title="Partager la présentation (SMS)" variant="secondary" onPress={() => openUrl('sms:?body=' + encodeURIComponent(whyMsg))} />
        </Card>

        {/* Étape 2 : partage du code promo */}
        <Card style={{ gap: 10, marginBottom: 12 }}>
          <Muted>Étape 2 — Partager mon code promo</Muted>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '900', letterSpacing: 4, color: colors.green }}>{code}</Text>
          </View>
          <Text style={{ color: colors.ink2, fontSize: 12.5 }}>
            Le lien ouvre directement la création de compte, avec votre code déjà prérempli — votre filleul n’a plus qu’à choisir son profil.
          </Text>
          <Button title="Partager sur WhatsApp" onPress={() => openUrl('https://wa.me/?text=' + encodeURIComponent(inviteMsg))} />
          <Button title="Partager par SMS" variant="secondary" onPress={() => openUrl('sms:?body=' + encodeURIComponent(inviteMsg))} />
        </Card>

        {/* Demande de reversement */}
        <Card style={{ gap: 10, marginBottom: 12 }}>
          <Muted>Demander un reversement</Muted>
          {pending ? (
            <Banner tone="warn" title="Demande en cours">
              {`Reversement de ${nf(pending.amount_fcfa)} FCFA ${pending.method === 'orzayah' ? 'vers votre compte ORZAYAH' : `au ${pending.mobile_money_number ?? 'Mobile Money'}`} — en cours de traitement.`}
            </Banner>
          ) : (
            <>
              <Segmented
                value={method}
                onChange={setMethod}
                options={[{ value: 'mobile_money', label: 'Mobile Money' }, { value: 'orzayah', label: 'Compte ORZAYAH' }]}
              />
              {method === 'mobile_money' ? (
                <Input label="Numéro Mobile Money à créditer" value={momo} onChangeText={setMomo} keyboardType="phone-pad" placeholder="Ex. 0700000000" />
              ) : (
                <Text style={{ color: colors.ink2, fontSize: 13 }}>
                  {data.orzayah_account ? `Reversement vers votre compte ORZAYAH : ${data.orzayah_account}` : 'Rattachez d’abord votre compte ORZAYAH ci-dessous.'}
                </Text>
              )}
              <Button
                title={due > 0 ? `Demander ${nf(due)} FCFA` : 'Aucun montant disponible'}
                onPress={() => requestPayout.mutate()}
                loading={requestPayout.isPending}
                disabled={!canRequest || (method === 'orzayah' && !data.orzayah_account)}
              />
            </>
          )}
        </Card>

        {/* Compte ORZAYAH */}
        <Card style={{ gap: 10, marginBottom: 12 }}>
          <Muted>Mon compte ORZAYAH</Muted>
          <Text style={{ color: colors.ink2, fontSize: 13 }}>
            Rattachez votre compte ORZAYAH pour gérer vos gains vous-même, directement depuis ORZAYAH.
          </Text>
          <Input label="Identifiant / numéro de compte ORZAYAH" value={orzayah} onChangeText={setOrzayah} placeholder="Votre compte ORZAYAH" />
          <Button title="Enregistrer mon compte ORZAYAH" onPress={() => saveOrzayah.mutate()} loading={saveOrzayah.isPending} />
          {!data.orzayah_account ? (
            <Button title="Créer mon compte ORZAYAH" variant="secondary" onPress={() => openUrl(data.orzayah_signup_url || 'https://orzayah.com')} />
          ) : null}
        </Card>

        {/* Historique des gains */}
        <Card style={{ gap: 8 }}>
          <Muted>Historique des gains</Muted>
          {(data.commissions ?? []).length === 0 ? (
            <Text style={{ color: colors.ink3, fontSize: 13 }}>Aucune commission pour l’instant. Partagez votre code promo pour commencer à gagner.</Text>
          ) : (
            (data.commissions ?? []).map((k) => (
              <View key={k.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.line }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontSize: 13.5 }}>{KIND_LABEL[k.kind] ?? k.kind}</Text>
                  <Text style={{ color: colors.ink3, fontSize: 11.5 }}>{date(k.created_at)}{k.payout_id ? ' · reversé' : ' · dû'}</Text>
                </View>
                <Text style={{ color: k.payout_id ? colors.ink3 : colors.green, fontWeight: '800', fontSize: 14 }}>+{nf(k.amount_fcfa)} F</Text>
              </View>
            ))
          )}
          {(data.requests ?? []).length > 0 ? (
            <>
              <Muted style={{ marginTop: 8 }}>Mes demandes de reversement</Muted>
              {data.requests.map((r) => (
                <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <Text style={{ color: colors.ink2, fontSize: 12.5 }}>{date(r.requested_at)} · {REQ_STATUS[r.status] ?? r.status}</Text>
                  <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 12.5 }}>{nf(r.amount_fcfa)} F</Text>
                </View>
              ))}
            </>
          ) : null}
        </Card>
      </Screen>
    </>
  );
}
