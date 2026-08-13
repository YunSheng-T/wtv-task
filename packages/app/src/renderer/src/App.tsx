import { useEffect, useState } from 'react';
import {
  AppShell, Box, Button, Group, Modal, Stack, Text, TextInput, Textarea,
  ActionIcon, Tooltip, ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPlus, IconSparkles, IconTargetArrow, IconBolt } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Requirement, Task } from '@wtv-task/core';
import { TaskDetail } from './components/TaskDetail.js';

const statusColor: Record<string, string> = {
  backlog: '#9aa3b2', active: '#4ea2ff', done: '#86efac', archived: '#6b7280',
  pending: '#c3c9d6', in_progress: '#4ea2ff', blocked: '#ff8a8a', cancelled: '#6b7280',
};

export function App() {
  const client = useQueryClient();
  const [selectedReq, setSelectedReq] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  useEffect(() => {
    const unsub = window.api.onEvent(() => {
      client.invalidateQueries({ queryKey: ['requirements'] });
      client.invalidateQueries({ queryKey: ['tasks'] });
      client.invalidateQueries({ queryKey: ['task'] });
      client.invalidateQueries({ queryKey: ['ideas'] });
      client.invalidateQueries({ queryKey: ['events'] });
      client.invalidateQueries({ queryKey: ['active'] });
    });
    return unsub;
  }, [client]);

  const { data: requirements = [] } = useQuery({ queryKey: ['requirements'], queryFn: () => window.api.listRequirements() });
  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', selectedReq],
    queryFn: () => window.api.listTasks(selectedReq!),
    enabled: !!selectedReq,
  });

  useEffect(() => {
    if (requirements.length && !selectedReq) {
      const saved = localStorage.getItem('wtv:selectedReq');
      setSelectedReq(saved && requirements.some((r) => r.id === saved) ? saved : requirements[0].id);
    }
  }, [requirements, selectedReq]);

  useEffect(() => {
    if (selectedReq) localStorage.setItem('wtv:selectedReq', selectedReq);
  }, [selectedReq]);

  useEffect(() => {
    if (tasks.length && !selectedTask) {
      const saved = localStorage.getItem('wtv:selectedTask');
      setSelectedTask(saved && tasks.some((t) => t.id === saved) ? saved : tasks[0].id);
    }
  }, [tasks, selectedTask]);

  useEffect(() => {
    if (selectedTask) localStorage.setItem('wtv:selectedTask', selectedTask);
  }, [selectedTask]);

  return (
    <AppShell
      header={{ height: 44 }}
      navbar={{ width: 264, breakpoint: 0 }}
      aside={{ width: 412, breakpoint: 0 }}
      padding={0}
      styles={{
        main: { background: 'transparent' },
        header: { background: 'transparent', borderBottom: '1px solid var(--hairline)' },
        navbar: { background: 'transparent', borderRight: '1px solid var(--hairline)' },
        aside: { background: 'transparent', borderLeft: '1px solid var(--hairline)' },
      }}
    >
      <AppShell.Header>
        <Header />
      </AppShell.Header>
      <AppShell.Navbar>
        <RequirementColumn requirements={requirements} selectedId={selectedReq} onSelect={setSelectedReq} />
      </AppShell.Navbar>
      <AppShell.Main>
        <TaskColumn
          requirement={requirements.find((r) => r.id === selectedReq) ?? null}
          tasks={tasks}
          selectedTaskId={selectedTask}
          onSelect={setSelectedTask}
        />
      </AppShell.Main>
      <AppShell.Aside>
        <ScrollArea h="100%" scrollbarSize={8} type="hover">
          <Box p={14}>
            {selectedTask ? (
              <TaskDetail taskId={selectedTask} />
            ) : (
              <EmptyHint icon={<IconTargetArrow size={26} />} title="No task selected" text="Pick a task to see its ideas, corrections, and agent activity." />
            )}
          </Box>
        </ScrollArea>
      </AppShell.Aside>
    </AppShell>
  );
}

function Header() {
  // macOS: reserve the left for traffic lights (hiddenInset);
  // Windows: reserve the right for the titleBarOverlay min/max/close buttons.
  const ua = navigator.userAgent;
  const isMac = ua.includes('Mac');
  const isWin = ua.includes('Windows');
  return (
    <Box className="titlebar-drag" h="100%" style={{ paddingLeft: isMac ? 96 : 16, paddingRight: isWin ? 150 : 16 }}>
      <Group h="100%" justify="space-between">
        <Group gap={8} className="titlebar-no-drag">
          <IconSparkles size={15} color="var(--accent)" />
          <Text className="display" size="sm">wtv-task</Text>
        </Group>
        <Text size="xs" c="dimmed" className="titlebar-no-drag" style={{ color: 'var(--ink-3)' }}>
          <span className="mono">{isWin ? 'Ctrl+Shift+K' : '⌘⇧K'}</span> to capture
        </Text>
      </Group>
    </Box>
  );
}

function EmptyHint({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Stack align="center" justify="center" h="62vh" gap={8} className="rise">
      <Box style={{ color: 'var(--accent)', opacity: .75 }}>{icon}</Box>
      <Text fw={600}>{title}</Text>
      <Text size="xs" ta="center" maw={260} style={{ color: 'var(--ink-3)' }}>{text}</Text>
    </Stack>
  );
}

function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Group justify="space-between" px={14} py={12}>
      <Text className="eyebrow">{children}</Text>
      {action}
    </Group>
  );
}

function RequirementColumn({ requirements, selectedId, onSelect }: {
  requirements: Requirement[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const client = useQueryClient();
  const [opened, handlers] = useDisclosure(false);
  const [title, setTitle] = useState('');
  const create = useMutation({
    mutationFn: () => window.api.createRequirement({ title }),
    onSuccess: (req) => { client.invalidateQueries({ queryKey: ['requirements'] }); onSelect(req.id); handlers.close(); setTitle(''); },
  });

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <SectionTitle action={
        <Tooltip label="New requirement" withinPortal><ActionIcon className="glass-btn lens-interactive" size="sm" variant="subtle" radius={10} onClick={handlers.open}><IconPlus size={15} /></ActionIcon></Tooltip>
      }>Requirements</SectionTitle>
      <ScrollArea style={{ flex: 1 }} px={10} pb={12} type="hover">
        <Stack gap={5}>
          {requirements.length === 0 && <Text size="xs" ta="center" py="xl" style={{ color: 'var(--ink-3)' }}>No requirements yet</Text>}
          {requirements.map((r, i) => {
            const active = selectedId === r.id;
            return (
              <Box
                key={r.id}
                className={`row rise ${active ? 'row-selected' : ''}`}
                px={12} py={8}
                style={{ animationDelay: `${i * 28}ms` }}
                onClick={() => onSelect(r.id)}
              >
                <Group gap={8} wrap="nowrap">
                  <span className="dot" style={{ color: statusColor[r.status], background: statusColor[r.status], boxShadow: 'none', flexShrink: 0 }} />
                  <Text size="sm" fw={active ? 600 : 400} lineClamp={1} style={{ color: active ? 'var(--ink-1)' : 'var(--ink-2)' }}>{r.title}</Text>
                </Group>
              </Box>
            );
          })}
        </Stack>
      </ScrollArea>
      <Modal opened={opened} onClose={handlers.close} title="New requirement" centered size="sm" radius="lg">
        <TextInput label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} className="glass-input"
          onKeyDown={(e) => e.key === 'Enter' && title.trim() && create.mutate()} data-autofocus />
        <Group justify="flex-end" mt="md">
          <Button className="accent-btn" size="xs" radius={10} onClick={() => create.mutate()} disabled={!title.trim()}>Create</Button>
        </Group>
      </Modal>
    </Box>
  );
}

function TaskColumn({ requirement, tasks, selectedTaskId, onSelect }: {
  requirement: Requirement | null; tasks: Task[]; selectedTaskId: string | null; onSelect: (id: string) => void;
}) {
  const client = useQueryClient();
  const [opened, handlers] = useDisclosure(false);
  const [title, setTitle] = useState('');
  const [goal, setGoal] = useState('');
  const create = useMutation({
    mutationFn: () => window.api.createTask({ requirementId: requirement!.id, title, goal }),
    onSuccess: (task) => { client.invalidateQueries({ queryKey: ['tasks'] }); onSelect(task.id); handlers.close(); setTitle(''); setGoal(''); },
  });

  return (
    <Box h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" px={18} py={12} style={{ borderBottom: '1px solid var(--hairline)' }}>
        <Box>
          <Text className="display" size="md" style={{ lineHeight: 1.2 }}>{requirement ? requirement.title : 'Select a requirement'}</Text>
          {requirement && <Text size="xs" mt={2} style={{ color: 'var(--ink-3)' }}>{tasks.length} task{tasks.length === 1 ? '' : 's'}</Text>}
        </Box>
        {requirement && <Button className="accent-btn" size="xs" radius={10} leftSection={<IconPlus size={14} />} onClick={handlers.open}>New task</Button>}
      </Group>
      <ScrollArea style={{ flex: 1 }} p={14} type="hover">
        <Stack gap={8}>
          {!requirement && <EmptyHint icon={<IconTargetArrow size={26} />} title="Nothing here yet" text="Select a requirement, or create one to get started." />}
          {requirement && tasks.length === 0 && <EmptyHint icon={<IconBolt size={26} />} title="No tasks" text="Add a task to track work and agent corrections." />}
          {tasks.map((t, i) => {
            const active = selectedTaskId === t.id;
            return (
              <Box
                key={t.id}
                className={`row rise ${active ? 'row-selected' : ''}`}
                px={12} py={10}
                style={{ animationDelay: `${i * 30}ms` }}
                onClick={() => onSelect(t.id)}
              >
                <Group gap={9} wrap="nowrap" mb={t.goal ? 3 : 0}>
                  <span className="dot" style={{ color: statusColor[t.status], background: statusColor[t.status], boxShadow: 'none', flexShrink: 0 }} />
                  <Text size="sm" fw={active ? 600 : 500} lineClamp={1} style={{ flex: 1, color: active ? 'var(--ink-1)' : 'var(--ink-2)' }}>{t.title}</Text>
                  {t.agentSession && (
                    <span className="dot pulse" style={{ color: 'var(--accent)', background: 'var(--accent)', flexShrink: 0 }} />
                  )}
                </Group>
                {t.goal && <Text size="xs" lineClamp={1} style={{ color: 'var(--ink-3)', paddingLeft: 16 }}>{t.goal}</Text>}
              </Box>
            );
          })}
        </Stack>
      </ScrollArea>
      <Modal opened={opened} onClose={handlers.close} title="New task" centered size="sm" radius="lg">
        <TextInput label="Title" value={title} onChange={(e) => setTitle(e.currentTarget.value)} className="glass-input" mb="sm" data-autofocus />
        <Textarea label="Goal" autosize minRows={2} value={goal} onChange={(e) => setGoal(e.currentTarget.value)} className="glass-input" />
        <Group justify="flex-end" mt="md">
          <Button className="accent-btn" size="xs" radius={10} onClick={() => create.mutate()} disabled={!title.trim()}>Create</Button>
        </Group>
      </Modal>
    </Box>
  );
}
