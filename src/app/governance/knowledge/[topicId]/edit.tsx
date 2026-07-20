import { useLocalSearchParams } from 'expo-router';
import { KnowledgeEditor } from '../../../../components/governance/knowledge-editor';

export default function EditGovernanceKnowledgeRoute() {
  const { topicId } = useLocalSearchParams<{ topicId: string }>();
  return <KnowledgeEditor topicId={topicId} />;
}
