import { useLocalSearchParams } from 'expo-router';
import { KnowledgeTopicDetailScreen } from '../../../../components/governance/knowledge-topic-detail';

export default function GovernanceKnowledgeTopicRoute() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  return <KnowledgeTopicDetailScreen topicId={topicId} />;
}
