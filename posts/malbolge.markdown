# The demonic world of Malbolge

> "INTERCAL's constructs are certainly tortuous, but they are all too
> flexible; you can, for instance, quite easily assign any number to a
> variable with a single statement.

> BrainF*** is lacking the flexibility which is INTERCAL's major weakness,
> but it fails in that its constructs are far, far too intuitive."

Those accusations were made by Ben Olmstead in the [official spec](http://www.lscheffer.com/malbolge_spec.html) for Malbolge. When you hear him decrying something as obtuse as Brainfuck for being too easy to use, you might imagine that whatever Malbolge is, it must be a huge pain in the ass. After staring at the spec for a couple weeks, not even knowing where to begin, I have to agree with you. This is a language that will strangle you in your sleep and dance on your grave. 

Let's take a look at the sample program offered on the [Wikipedia page](http://en.wikipedia.org/wiki/Malbolge#.22Hello_world.22_in_Malbolge), a standard "Hello World!" program.

    ('&%:9]!~}|z2Vxwv-,POqponl$Hjig%eB@@>}=<M:9wv6WsU2T|nm-,jcL(I&%$#"
    `CB]V?Tx<uVtT`Rpo3NlF.Jh++FdbCBA@?]!~|4XzyTT43Qsqq(Lnmkj"Fhg${z@>

Abandon all hope, indeed.

## Decryptifizication

Well, that looks pretty bad. Fortunately, we'll find it's easier to reverse-engineer than it was to write in the first place. In order to start making sense of this, the first step is to decrypt the code.

1. Starting at zero, assign an index to each character (excluding whitespace).
2. For each character, add the index to the ASCII value.
3. Take the remainder of the result divided by 94.
4. Decrypt each remainder using the following cipher

          Remainder   4   5  23  39  40  62  68  81
        Replaced by   i   <   /   *   j   p   o   v

As an example, take the first character, an open parenthesis. The ASCII value of this character is 40, and its index is 0. (40 + 0) % 94 = 40. Looking up 40 in the cipher table, we see that the open parenthesis normalizes to a `j`. The second character (index = 1) is an apostrophe (ASCII = 39). This gives us (39 + 1) % 94 = 40. So the apostrophe is also replaced by a `j`. Decrypting the entire program in this manner gives us:

    jjjjpp<jjjj*p<jjjpp<<jjjj*p<jj*o*<i<io<</<<oo<*o*<jvoo<<opj<*<<<<<
    ojjopjp<jio<ovo<<jo<p*o<*jo<iooooo<jj*p<jji<oo<j*jp<jj**p<jjopp<i

It still looks like gibberish, but at least it's a smaller set of characters. These are single-character commands that get executed sequentially.

## Turbulent flow

The `i` command works like `goto`. It jumps the code pointer to a specified location in the program. For now, don't worry about how it knows where to jump. I'm going to split up the normalized code.

1. `jjjjpp<jjjj*p<jjjpp<<jjjj*p<jj*o*<i`
2. `<io<</<<oo<`
3. `*o*<jv`
4. `oo<<opj<*<<<<<oj`
5. `jopjp<ji`
6. `o<ovo<<jo<p*o<*jo<iooooo<`
7. `jj*p<jji`
8. `<oo<`
9. `j*jp<jj**p<jjopp<i`

The blocks are executed in the order (1, 9, 7, 5, 3). The pieces of code in-between (the even-numbered blocks) are never executed. The `v` command signals the program to terminate. The `<` command prints a character to standard output. If you count the number of `<`s that the program executes, you'll see that there are just enough to print the phrase "Hello World!" with no newline at the end.

So somehow, the sections of code between the `<`s are generating the data to print. But how is the program storing the data? Why the arbitrary jumps? What about the sections that aren't executed at all? This is where things start getting fun.

## Three registers of the apocalypse

Malbolge has three registers, non-negative integers. The first is the code pointer, which is set to the index of the instruction currently being executed. The code pointer increments after each instruction is executed and, if an `i` is encountered, will leap across the program to a new location.

One feature, that thankfully doesn't come into play in our program, is the code pointer's ability to scramble instructions as it executes them. Each time the code pointer increments, the preceding instruction character is encrypted according to a substitution cipher (not pictured). This makes writing predictable loops in Malbolge extremely difficult.

The second register is the accumulator. Initially set to 0, the accumulator is used for input and output. `<` prints the accumulator to the terminal, and `/` grabs a character from the input stream and stores it in the accumulator. The accumulator is not changed by calls to standard output, so once it's been set to the desired value, we can print the same character over and over again. (You can spot the code that prints the double 'l' in "Hello.")

The third register is the data pointer. It makes the lives of the other two registers difficult. Like the code pointer, the data pointer points to a character in the program and increments each time an instruction is executed. The code itself is the data manipulated by the program. This justifies the existence of code that doesn't get executed; the pieces that the code pointer doesn't pass over might be used as data by the data pointer. The data pointer is used to set the value of the accumulator.

The code and data pointers are the principal demons we must wrestle with when programming in Malbolge. The program code doubles as the program data, and simple acts of program execution and data manipulation alter it in ways that are difficult to control. For a program as simple as the one we are studying, damage control is pretty easy. The program doesn't need to loop, and the data and code pointers are segregated, operating on different blocks of characters. Note also that the data pointer operates on the non-decrypted characters. So even though the code pointers treats the first character as a `j` command, the data pointer only sees an open parenthesis. This is significant since the program cannot contain arbitrary characters at the start; all characters must decrypt to one of the eight allowed commands.

For the remainder of the article, I'll refer to the three registers as _C_ (code pointer), _D_ (data pointer), and _A_ (accumulator). The values or characters that _C_ and _D_ point to will be called _[C]_ and _[D]_.

## Ternary mathematics

Unless you're an ancient Babylonian, chances are you do most of your math in base 10. Your digits come in the flavors 0, 1, 2, 3, 4, 5, 6, 7, 8, and 9, which are enough to give you plenty of mileage. Computers, as you are no doubt aware, do their math in base 2. This is the number system we may have come up with if we had only one finger on each hand, and it requires twaddling those digits furiously up and down. With only a 0 and 1 to work with, binary mathematics is a bit more verbose.

The Malbolge virtual machine is kind enough to give us an extra numeral to work with. Malbolge mathematics is done in ternary, using the digits 0, 1, and 2. One ternary digit (trit) is about 1.6 bits of information. In Malbolge, everything -- the registers and the program code/data -- is treated as an unsigned 10-trit integer. So we can store any number up to (3^10 - 1) -- that's 2222222222 in ternary, 59048 in decimal, 1110011010101000 in binary.

Since _C_ and _D_ are 10 both trits long, every Malbolge program has exactly 59049 accessible memory locations. At the start of runtime, the first few memory locations are filled with the characters from the program. (In a minute, we'll see what the rest of the memory contains. Hint: it's not zero.) Since programs generally contain only printable characters, the only easily accessible values are between 32 (0t1012) and 128 (0t11202), but each memory address is capable of storing numbers up to 59048 (0t2222222222).

## Marshalling the forces of Hell

Here's a rundown of all the commands in Malbolge.

`o` does nothing. How refreshing! Note that the normal side effects take place -- the command is encrypted after execution, and _C_ and _D_ increment.

If _C_ encounters something other than the eight specified commands, it treats it as `o`. Such characters cannot be written into programs, but they will arise at runtime as _C_ scrambles previously-executed commands.

`v` halts the program. What a relief! Note that if this command is never encountered, the code pointer will continue to cycle through the entire memory, wrapping from 59048 back to 0.

`<` prints (_A_ % 128) to the output stream as an ASCII character. 

`/` gets a character from the input stream and stores it in _A_.

`i` sets _C_ to the memory address indicated by _[D]_. Afterwards, _C_ and _D_ increment as usual.

`j` sets _D_ to the memory address indicated by _[D]_. Afterwards, _C_ and _D_ increment as usual.

Finally we're left with the data manipulation commands. These operate on _[D]_ and _A_ and replace both by the result. This means that to set the accumulator to a desired value, we are forced to modify the instructions/data in memory.

`*` is an unary operator on _[D]_. It rotates the trits to the right by one place. For example, if _[D]_ contains decimal 100 (0t10201), applying the `*` operator results in 6594 (0t1000001020). Both _[D]_ and _A_ will be set to 6594.

`p` is referred to in the spec simply as "op". Op is a binary operator on _[D]_ and _A_. It takes corresponding trits in _[D]_ and _A_ and transforms them according to the following table.

               A
            0  1  2
          +--------
        0 | 1  0  0
    [D] 1 | 1  0  2
        2 | 2  2  1 

Suppose _A_ is initially set to 0 and _[D]_ is 100. _[D]_ op _A_ = 0t0000010201 op 0t0000000000 = 0t1111111211 = 29533. Both _A_ and _[D]_ will be set to 29533.

Op was designed to have no discernible pattern. When the Malbolge virtual machine loads a program into memory, all unspecified memory addresses are filled by applying op to the previous two memory values. Therefore, if the code or data pointers move outside the bounds of the user-specified program, they will operate on essentially arbitrary data.

How to combine `*` and `p` to perform basic arithmetic operations is left as an exercise to the reader.

## Walkthrough

Below is a trace of the program in tabular form.

      C    [C]    Decrypted [C]    D    [D]       A    Output  
      0     (         j            0     40       0      
      1     '         j           41     58       0      
      2     &         j           59     40       0      
      3     %         j           41     58       0      
      4     :         p           59     40       0      
      5     9         p           60     73   29524      
      6     ]         <           61     38      72    H  
      7     !         j           62     37      72      
      8     ~         j           38     61      72      
      9     }         j           62     37      72      
     10     |         j           38     61      72      
     11     z         *           62     37      72      
     12     2         p           63     36   19695      
     13     V         <           64     35    9829    e  
     14     x         j           65     34    9829      
     15     w         j           35     64    9829      
     16     v         j           65     34    9829      
     17     -         p           35     64    9829      
     18     ,         p           36     62   19749      
     19     P         <           37    125    9836    l  
     20     O         <           38     61    9836    l  
     21     q         j           39     60    9836      
     22     p         j           61     38    9836      
     23     o         j           39     60    9836      
     24     n         j           61     38    9836      
     25     l         *           39     60    9836      
     26     $         p           40     77      20      
     27     H         <           41     58   29551    o  
     28     j         j           42     57   29551      
     29     i         j           58     76   29551      
     30     g         *           77    116   29551      
     31     %         o           78     84   39404      
     32     e         *           79     96   39404      
     33     B         <           80     82      32    _space_  
     34     @         i           81    112      32      
    113     s         j           82    111      32      
    114     q         *          112     54      32      
    115     q         j          113     82      18      
    116     (         p           83     51      18      
    117     L         <           84     78   29527    W  
    118     n         j           85    108   29527      
    119     m         j          109     84   29527      
    120     k         *           85    108   29527      
    121     j         *           86     70      36      
    122     "         p           87     46   19706      
    123     F         <           88     74    9839    o  
    124     h         j           89    104    9839      
    125     g         j          105     88    9839      
    126     $         o           89    104    9839      
    127     {         p           90     43    9839      
    128     z         p           91     43   19691      
    129     `         <           92     70    9842    r  
    130     >         i           93    100    9842      
    101     !         j           94     98    9842      
    102     ~         j           99     63    9842      
    103     |          *           6     35    9842      
    104     4         p           65     34   39377      
    105     X         <           66     96    9836    l  
    106     z         j           67     67    9836      
    107     y         j           68     66    9836      
    108     T         i           67     67    9836      
     68     B         j           68     66    9836      
     69     ]         o           67     85    9836      
     70     V         p           68     62    9836      
     71     ?         j           69     98   19750      
     72     T         p           99     63   19750      
     73     x         <          100     98    9828    d  
     74     <         j          101     53    9828      
     75     u         i           54     45    9828      
     46     W         *           55     44    9828      
     47     s         o           56    106   39380      
     48     U         *           57     99   39380      
     49     2         <           58     76      33    !  
     50     T         j           59  29524      33      
     51     |         v        29525  29522      33      

## In memoriam

And that's "Hello, World!" Hopefully the amount of ink I've spilt on the subject gives you some idea of how monumentally difficult Malbolge is. If I decide to write more about Malbolge at some point, I'd like to demonstrate some of the tricks that have been used to make the language behave. For now, I'll leave you with some links.

* [The official specification](http://www.lscheffer.com/malbolge_spec.html) -- as mirrored on Lou Scheffer's website.
* [Lou Sheffer's Malbolge page](http://www.lscheffer.com/malbolge.shtml) -- with some ground-breaking investigations on how to tame the beast.
* [The Esolang Wiki](http://esolangs.org/wiki/Malbolge_programming) -- more programming advice, building off Scheffer's work.
* [99 Bottles of Beer](http://www.99-bottles-of-beer.net/language-malbolge-995.html) -- To date, the most complex Malbolge program written. Cheers.
