//go:build ignore

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_tracing.h>

char LICENSE[] SEC("license") = "Dual BSD/GPL";

#define MAX_PAYLOAD 256
#define TASK_COMM_LEN 16
#define PERF_BUF_SIZE (128 * 1024 * 1024)

struct event {
    u32 pid;
    u32 tid;
    u64 timestamp;
    char comm[TASK_COMM_LEN];
    u16 sport;
    u16 dport;
    u32 saddr;
    u32 daddr;
    u8 is_send;
    u8 protocol;
    u32 len;
    char payload[MAX_PAYLOAD];
};

struct {
    __uint(type, BPF_MAP_TYPE_PERF_EVENT_ARRAY);
    __uint(key_size, sizeof(u32));
    __uint(value_size, sizeof(u32));
    __uint(max_entries, 1024);
} events SEC(".maps");

static __always_inline void *bpf_cast_to_kern(void *p) {
    return (void *)((unsigned long)p & ((1UL << 63) - 1));
}

static __always_inline int process_msg(struct pt_regs *ctx, struct sock *sk, struct msghdr *msg, size_t len, int is_send, u8 protocol) {
    struct event e = {};
    u32 pid = bpf_get_current_pid_tgid() >> 32;
    u32 tid = bpf_get_current_pid_tgid() & 0xFFFFFFFF;
    
    e.pid = pid;
    e.tid = tid;
    e.timestamp = bpf_ktime_get_ns();
    e.is_send = is_send;
    e.protocol = protocol;
    e.len = len > MAX_PAYLOAD ? MAX_PAYLOAD : len;
    
    bpf_get_current_comm(&e.comm, sizeof(e.comm));
    
    struct sock_common *skc = (struct sock_common *)sk;
    
    bpf_probe_read(&e.sport, sizeof(e.sport), &skc->skc_num);
    bpf_probe_read(&e.dport, sizeof(e.dport), &skc->skc_dport);
    bpf_probe_read(&e.saddr, sizeof(e.saddr), &skc->skc_rcv_saddr);
    bpf_probe_read(&e.daddr, sizeof(e.daddr), &skc->skc_daddr);
    
    if (e.len > 0) {
        struct iovec *iov = NULL;
        bpf_probe_read(&iov, sizeof(iov), &msg->msg_iov);
        
        if (iov) {
            void *iov_base = NULL;
            bpf_probe_read(&iov_base, sizeof(iov_base), &iov->iov_base);
            
            if (iov_base) {
                bpf_probe_read_user(&e.payload, e.len, iov_base);
            }
        }
    }
    
    bpf_perf_event_output(ctx, &events, BPF_F_CURRENT_CPU, &e, sizeof(e));
    return 0;
}

SEC("kprobe/tcp_sendmsg")
int BPF_KPROBE(tcp_sendmsg_entry, struct sock *sk, struct msghdr *msg, size_t len) {
    return process_msg(ctx, sk, msg, len, 1, 6);
}

SEC("kprobe/tcp_recvmsg")
int BPF_KPROBE(tcp_recvmsg_entry, struct sock *sk, struct msghdr *msg, size_t len, int flags) {
    return process_msg(ctx, sk, msg, len, 0, 6);
}

SEC("kprobe/udp_sendmsg")
int BPF_KPROBE(udp_sendmsg_entry, struct sock *sk, struct msghdr *msg, size_t len) {
    return process_msg(ctx, sk, msg, len, 1, 17);
}

SEC("kprobe/udp_recvmsg")
int BPF_KPROBE(udp_recvmsg_entry, struct sock *sk, struct msghdr *msg, size_t len, int flags) {
    return process_msg(ctx, sk, msg, len, 0, 17);
}
