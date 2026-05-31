`timescale 1ns / 1ps

package fpga_types;
    parameter DATA_WIDTH = 16;
    parameter WEIGHT_WIDTH = 16;
    parameter ACC_WIDTH = 32;
    parameter FRAC_BITS = 8;
    
    typedef logic signed [DATA_WIDTH-1:0] data_t;
    typedef logic signed [WEIGHT_WIDTH-1:0] weight_t;
    typedef logic signed [ACC_WIDTH-1:0] acc_t;
    
    typedef struct packed {
        data_t [3:0] data;
    } data_vector_t;
    
    typedef struct packed {
        weight_t [3:0] weight;
    } weight_vector_t;
    
endpackage
