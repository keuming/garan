import { Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Card, Loading, Muted, Screen } from '../../src/components/ui';
import { api, shopPublicUrl } from '../../src/lib/api';
import { useAuth } from '../../src/lib/auth';
import { fcfa } from '../../src/lib/format';
import { colors, radius } from '../../src/lib/theme';

function ListingCard({ item, canEdit }) {
  const out = item.quantity <= 0;
  return (
    <Pressable
      disabled={!canEdit}
      onPress={() => router.push({ pathname: '/listing-form', params: { id: item.id } })}
      style={({ pressed }) => [pressed && { opacity: 0.9 }]}
    >
      <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {item.photo_url ? (
          <Image source={{ uri: item.photo_url }} style={st.thumb} />
        ) : (
          <View style={[st.thumb, st.thumbEmpty]}><Text style={{ fontSize: 22 }}>📱</Text></View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={st.title} numberOfLines={1}>{item.title}</Text>
          <Text style={st.price}>{fcfa(item.price)}</Text>
          {item.description ? <Muted style={{ fontSize: 12.5 }} >{item.description}</Muted> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            <Text style={[st.badge, out ? st.badgeOut : st.badgeOk]}>{out ? 'Rupture' : `${item.quantity} en stock`}</Text>
            {item.status === 'hidden' ? <Text style={[st.badge, st.badgeHidden]}>Masqué</Text> : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function Availability() {
  const { user, isOwner } = useAuth();
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: ['org', 'listings'], queryFn: () => api.get('/org/listings') });
  const items = data?.items ?? [];
  const shopId = user?.shops?.[0]?.id;

  async function shareVitrine() {
    if (!shopId) return;
    const url = shopPublicUrl(shopId);
    const name = user?.role === 'agent' ? user.shops?.[0]?.name : user?.organization?.name;
    await Share.share({ message: `🛍️ Téléphones disponibles chez ${name} — voir et réserver :\n${url}`, url });
  }

  return (
    <Screen refreshing={isFetching && !isLoading} onRefresh={refetch}>
      <Banner tone="info" title="Vitrine de la boutique">
        Ajoutez ici les téléphones réellement disponibles. Votre vitrine est partageable sur WhatsApp et les réseaux ; le stock baisse automatiquement à chaque vente.
      </Banner>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {isOwner ? (
          <View style={{ flex: 1 }}>
            <Button title="+ Ajouter un article" onPress={() => router.push('/listing-form')} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button title="Partager la vitrine" variant="secondary" onPress={shareVitrine} disabled={!shopId} />
        </View>
      </View>

      {isLoading ? <Loading /> : null}
      {!isLoading && items.length === 0 ? (
        <Muted>Aucun article pour l’instant. {isOwner ? 'Appuyez sur « Ajouter un article ».' : 'Demandez au compte principal d’en ajouter.'}</Muted>
      ) : null}
      {items.map((it) => <ListingCard key={it.id} item={it} canEdit={isOwner} />)}
    </Screen>
  );
}

const st = StyleSheet.create({
  thumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.line },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15.5, fontWeight: '700', color: colors.ink },
  price: { fontSize: 15, fontWeight: '800', color: colors.blue },
  badge: { fontSize: 11.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  badgeOk: { backgroundColor: colors.okBg, color: colors.ok },
  badgeOut: { backgroundColor: colors.dangerBg, color: colors.danger },
  badgeHidden: { backgroundColor: colors.line, color: colors.ink2 }
});
