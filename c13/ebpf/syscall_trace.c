#include <linux/types.h>
#include <linux/bpf.h>
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>
#include <bpf/bpf_core_read.h>
#include <stdint.h>

char LICENSE[] SEC("license") = "Dual BSD/GPL";

struct syscall_event {
    __u32 pid;
    __u32 tid;
    __s32 syscall_nr;
    __u64 duration_ns;
    __u64 timestamp;
    __u64 args[6];
    __s64 ret;
};

struct syscall_entry {
    __u64 start_time;
    __u64 args[6];
};

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 10240);
    __type(key, __u32);
    __type(value, struct syscall_entry);
} entry_map SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_HASH);
    __uint(max_entries, 1024);
    __type(key, __u32);
    __type(value, __u32);
} target_pids SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_RINGBUF);
    __uint(max_entries, 256 * 1024);
} rb SEC(".maps");

struct trace_event_raw_sys_enter_kernel {
    __u64 pad;
    long id;
    unsigned long args[6];
} __attribute__((preserve_access_index));

struct trace_event_raw_sys_exit_kernel {
    __u64 pad;
    long id;
    long ret;
} __attribute__((preserve_access_index));

static __always_inline __u32 get_current_pid(void) {
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    return (__u32)(pid_tgid >> 32);
}

static __always_inline __u32 get_current_tid(void) {
    __u64 pid_tgid = bpf_get_current_pid_tgid();
    return (__u32)pid_tgid;
}

static __always_inline bool is_target_pid(__u32 pid) {
    __u32 *val = bpf_map_lookup_elem(&target_pids, &pid);
    return val != NULL;
}

static __always_inline bool should_monitor(void) {
    __u32 pid = get_current_pid();
    __u32 zero = 0;
    __u32 *monitor_all = bpf_map_lookup_elem(&target_pids, &zero);
    return monitor_all != NULL || is_target_pid(pid);
}

SEC("tp/syscalls/sys_enter")
int handle_sys_enter(struct trace_event_raw_sys_enter_kernel *ctx) {
    if (!should_monitor()) {
        return 0;
    }
    
    __u32 tid = get_current_tid();
    struct syscall_entry entry = {0};
    
    entry.start_time = bpf_ktime_get_ns();
    
    entry.args[0] = BPF_CORE_READ(ctx, args[0]);
    entry.args[1] = BPF_CORE_READ(ctx, args[1]);
    entry.args[2] = BPF_CORE_READ(ctx, args[2]);
    entry.args[3] = BPF_CORE_READ(ctx, args[3]);
    entry.args[4] = BPF_CORE_READ(ctx, args[4]);
    entry.args[5] = BPF_CORE_READ(ctx, args[5]);
    
    if (bpf_map_update_elem(&entry_map, &tid, &entry, BPF_ANY) != 0) {
        return 0;
    }
    
    return 0;
}

SEC("tp/syscalls/sys_exit")
int handle_sys_exit(struct trace_event_raw_sys_exit_kernel *ctx) {
    if (!should_monitor()) {
        return 0;
    }
    
    __u32 tid = get_current_tid();
    struct syscall_entry *entry = bpf_map_lookup_elem(&entry_map, &tid);
    if (!entry) {
        return 0;
    }
    
    __u64 end_time = bpf_ktime_get_ns();
    __u64 duration = end_time - entry->start_time;
    
    struct syscall_event *event = bpf_ringbuf_reserve(&rb, sizeof(*event), 0);
    if (!event) {
        bpf_map_delete_elem(&entry_map, &tid);
        return 0;
    }
    
    event->pid = get_current_pid();
    event->tid = tid;
    event->syscall_nr = (__s32)BPF_CORE_READ(ctx, id);
    event->duration_ns = duration;
    event->timestamp = end_time;
    
    __builtin_memcpy(event->args, entry->args, sizeof(entry->args));
    
    event->ret = BPF_CORE_READ(ctx, ret);
    
    bpf_ringbuf_submit(event, 0);
    bpf_map_delete_elem(&entry_map, &tid);
    
    return 0;
}
