import { RecorderWorkspace } from "@/app/workspace/RecorderWorkspace";

interface WorkflowEditorPageProps {
  params: Promise<{ workflowId: string }>;
}

export default async function WorkflowEditorPage({ params }: WorkflowEditorPageProps) {
  const { workflowId } = await params;
  return <RecorderWorkspace workflowId={workflowId} />;
}
