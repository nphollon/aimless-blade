# A quick and dirty guide to Ruby Inline

There comes a point in every young person's life when they must confront their inner demons and figure out how integrate their interpreted language of choice with C. For me, this is that point. Fortunately, the [Ruby Inline gem](https://github.com/seattlerb/rubyinline) makes inserting C into Ruby easy and painless.

The project README offers a simple example of writing a factorial function. This guide will introduce some more complex integration of Ruby and C. Specifically, we will look at how to write a Ruby class completely in C.

I'm still very new to the world of C extensions, so if something in this guide is wrong or incomplete, please let me know! My other readers and I all appreciate your insights.

## Prerequisites

You should know a little Ruby and a little C. If you can understand the Ruby code in the next section, and you know what a struct and a pointer are, you should be good to go.

You can install the Ruby Inline gem from the command line with: `gem install -y RubyInline`


## A Ruby Rectangle class

Here is the class that we will be converting to C. We have two alternate versions of a Rectangle area method. The first is a class method that receives length and width as arguments. The second is an instance method that makes use of length and width instance variables.

    class RubyRectangle

      def self.area1(length, width)
        length * width
      end

      attr_reader :length, :width
      
      def initialize(length, width)
        @length = length
        @width = width
      end

      def area2
        length * width
      end
    end

## A C Rectangle class

This is what our rectangle class will look like after we've Inline-ified it. The guide will go through this code line-by-line. We'll also look at some alternate implementations of the area function.

require 'inline'

    class NativeRectangle
      inline do |builder|
        builder.c_singleton <<-EOC
          int area1(int length, int width) {
            return length * width;
          }
        EOC

        builder.prefix <<-EOC
          typedef struct Rectangle {
            int length;
            int width;
          } Rectangle;

          static void free_rectangle(Rectangle *rect) {
            free(rect);
          }
        EOC

        builder.struct_name = 'Rectangle'
        builder.reader :length, 'int'
        builder.reader :width, 'int'

        builder.c_singleton <<-EOC
          VALUE new(int length, int width) {
            Rectangle *rect;
            rect = malloc( sizeof(Rectangle) );

            rect->length = length;
            rect->width = width;

            return Data_Wrap_Struct(self, 0, free_rectangle, rect);
          }
        EOC

        builder.c <<-EOC
          int area2() {
            Rectangle *rect;
            Data_Get_Struct(self, Rectangle, rect);
            return rect->length * rect->width;
          }
        EOC
      end
    end

As you can see, all of the magic happens in the `inline do |builder| ... end` block. `builder` is an instance of [`Inline::C`](http://docs.seattlerb.org/RubyInline/Inline/C.html), to which we will attach all of our C code.

## Attaching a C function to a Ruby class

    class NativeRectangle
      inline do |builder|
        builder.c_singleton <<-EOC
          int area1(int length, int width) {
            return length * width;
          }
        EOC
      end
    end

The `c_singleton` method takes a string argument. It parses the string as a C function, and attaches it to the enclosing Ruby class. So we can call this function just like `area1` in the `RubyRectangle` class:

    irb> RubyRectangle.area1(3,4)
    => 12
    irb> NativeRectangle.area1(3,4)
    => 12

`c_singleton` expects its string to contain exactly _one_ function. If you want to write multiple class functions, you need to call `c_singleton` multiple times.

By the way, in case you haven't seen it before (or forgot about it, like I did), `<<-EOC ... EOC` is just a fancy set of quotation marks. We could have just as legitimately written

    builder.c_singleton "
      int area1(int length, int width) {
        return length * width;
      }"

Or even crammed it onto one line:

    builder.c_singleton "int area1(int length, int width) {return length*width;}"

The `<<-EOC ... EOC` syntax is a good choice in this case because it nicely delineates the C code, and we might potentially use both single and double quotation marks in our C code.

## Attaching a C function to a Ruby object

If we want to make an instance-level method instead of a class-level method, it's as simple as replacing `builder.c_singleton` with `builder.c`. If we write this:

    class NativeRectangle
      inline do |builder|
        builder.c <<-EOC
          int area1(int length, int width) {
            return length * width;
          }
        EOC
      end
    end

Then we call it like this:

    irb> NativeRectangle.new.area1(3,4)
    => 12

Of course, since we're still passing the length and width arguments to the function, we haven't really gained anything. Wouldn't it be great if there were a way to utilize instance variables/methods in our C function...

## What's the deal with types?

There is a way, and we'll look at it in a minute. First, let me point out a bit of magic that Ruby Inline performed for us with the `area1` function. In the C function signature, `area1` takes two `ints` as arguments and returns an `int`. But if we look at the Ruby side of things...

    irb> 3.class
    => Fixnum
    irb> 2.class
    => Fixnum
    irb> NativeRectangle.area1(3,2).class
    => Fixnum

The arguments and return value are `Fixnums`. For arguments and return types, Ruby Inline automatically casts simple C types to/from Ruby objects. We don't have to rely on this automatic conversion; rewriting the function with explicit type-casting gives us:

    builder.c_singleton <<-EOC
      VALUE area1(VALUE length, VALUE width) {
        int l = FIX2INT(length);
        int w = FIX2INT(width);
        return INT2FIX(l * w);
      }
    EOC

In the Land of C, all Ruby objects take on the type `VALUE`. Our `area1` function assumes that it is given `Fixnums` and converts them to `ints` with the `FIX2INT` function. It then converts the return value back to a Ruby object with `INT2FIX`. Similar conversion functions exist for the other basic C datatypes (`char`, `double`, etc.).

# Calling Ruby functions from C

You may have spotted a weakness in our C code. Let's compare the output of `RubyRectangle.area1` and `NativeRectangle.area1`:

    irb> RubyRectangle.area1(2,5)
    => 10
    irb> RubyRectangle.area1(2.0, 5.0)
    => 10.0
    irb> RubyRectangle.area1("Hello", "World")
    TypeError: can't convert String into Integer

    irb> NativeRectangle.area1(2,5)
    => 10
    irb> NativeRectangle.area1(2.0, 5.0)
    => 866672268
    irb> NativeRectangle.area1("Hello", "World")
    => -1050457840

The Ruby method doesn't really care about its arguments' types. All that matters is that they can be multiplied together. If the arguments can't be multiplied, an exception is raised. The C method behaves properly if given `Fixnums` as arguments, but if given anything else, it returns crap. Never is an exception raised.

The problem is that `FIX2INT` doesn't actually check if its argument is a `Fixnum`. It will convert any value of type `VALUE` to type `int`, even if that conversion doesn't make any sense. This gives rise to two issues. Ruby objects with a valid multiply operation (e.g. `Floats`) are multiplied incorrectly, and Ruby objects without a valid multiply operation (e.g. `Strings`) do not raise an error.

Both of these problems can be solved by using Ruby's multiplication operation instead of C's. This can be accomplished with the `rb_funcall` function:

    builder.c_singleton <<-EOC
      VALUE area1_flexible(VALUE length, VALUE width) {
        return rb_funcall(length, rb_intern("*"), 1, width);
      }
    EOC

For this to make sense, we have to remember that in Ruby, `length * width` is equivalent to `length.*(width)`. The first argument to `rb_funcall` is the object on which the method is called. The second argument is the method itself... `rb_intern` converts a string into a Ruby method name. The third argument is the number of parameters the method takes. Every argument after the third gets passed to the method.

Here are some more examples using `rb_funcall`:

* `rb_funcall(length, rb_intern("to_s"), 0);`
* `rb_funcall(length, rb_intern("abs"), 0);`
* `rb_funcall(length, rb_intern("modulo"), 1, width);`
* `rb_funcall(length, rb_intern("between?"), 2, INT2FIX(0), INT2FIX(10));`

Note the use of `INT2FIX` in the last example. The first argument to `rb_funcall` must a `VALUE`. Every argument after the third must also be of type `VALUE`. `rb_funcall` returns a `VALUE`.

How does our improved area function behave?

    irb> NativeRectangle.area1_flexible(2, 5)
    => 10
    irb> NativeRectangle.area1_flexible(2.0, 5.0)
    => 10.0
    irb> NativeRectangle.area1_flexible("Hello", "World")
    TypeError: can't convert String into Integer

Mission accomplished!

I'm not going to say whether `area1_flexible` is better than `area1`. If you're writing a C extension, you probably value performance pretty highly, and `area1` is going to be more performant than `area1_flexible`. It's just important to keep in mind the potential entry points for bugs, and... Well, basically this is another reason why you should always unit test your code. Not that you need me reminding you ;-)

## Attaching a C function to a Ruby object: 2nd attempt

With `rb_funcall` added to our arsenal, we can write an instance method for `NativeRectangle` that utilizes getters.

    class NativeRectangle
      attr_reader :length, :width

      def initialize(length, width)
        @length = length
        @width = width
      end

      inline do |builder|
        builder.c <<-EOC
          VALUE area2() {
            VALUE length = rb_funcall(self, rb_intern("length"), 0);
            VALUE width = rb_funcall(self, rb_intern("width"), 0);
            return rb_funcall(length, rb_intern("*"), 1, width);
          }
        EOC
      end
    end

The one new concept in this code is the `self` variable. This is another bit of magic from Inline. Whenever we attach a function using `builder.c` or `builder.c_singleton`, Inline inserts an _invisible, super-secret argument_ at the front of the function signature. This means that our functions have access to a variable `self` (of type `VALUE`), just like in Ruby!

Important to keep in mind! If our C function calls another attached C function, we need to remember to pass it `self`:

    builder.c <<-EOC
      VALUE does_area_equal(VALUE number) {
        return rb_funcall(area2(self), rb_intern("=="), 1, number);
      }
    EOC

Of course, since `area2` is attached to the `NativeRectangle` object, we could also call it using `rb_funcall`:

    builder.c <<-EOC
      VALUE does_area_equal(VALUE number) {
        VALUE area = rb_funcall(self, rb_intern("area2"), 0);
        return rb_funcall(area, rb_intern("=="), 1, number);
      }
    EOC

## Writing a constructor in C

Now it's time to Inline-ify that `initialize`. What do we need our constructor to do?

1. Allocate memory for a `NativeRectangle`, including its instance variables.
2. Tell the Ruby garbage collector how to (eventually) free the allocated memory.
3. Assign values to the instance variables.
4. Return a reference to the newly-created object.

Ruby constructors usually handle three of these tasks automatically. Our C code is going to be a bit more verbose:

    class NativeRectangle
      inline do |builder|
        builder.prefix <<-EOC
          typedef struct Rectangle {
            int length;
            int width;
          } Rectangle;

          static void free_rectangle(Rectangle *rect) {
            free(rect);
          }
        EOC

        builder.c_singleton <<-EOC
          VALUE new(int length, int width) {
            Rectangle *rect;
            rect = malloc( sizeof(Rectangle) );

            rect->length = length;
            rect->width = width;

            return Data_Wrap_Struct(self, 0, free_rectangle, rect);
          }
        EOC
      end
    end

### The prefix block

`builder.prefix` differs from `builder.c` and `builder.c_singleton` in a few ways. First, we are not limited to writing one function at a time. We can cram as much code into the prefix block as we want. Second, the code is not attached to our Ruby class. The prefix above defines a struct and a function. These can be referenced from our other C functions, but they are completely inaccessible from Ruby. The prefix is a good place to put helper code that does not need access to `self`.

Our first order of business is defining the struct `Rectangle`. This struct stores the data for our `NativeRectangle` object. The subsequent C code can convert this struct to and from a `VALUE` using the `Data_Wrap_Struct` and `Data_Get_Struct` functions.

Our next order of business is specifying the garbage-collection function `free_rectangle`. We will pass this function to `Data_Wrap_Struct` when converting our struct to a Ruby object. The Ruby garbage collector will call `free_rectangle` when it comes time to free the object's memory. Since our `Rectangle` struct only comprises two `ints`, the function is pretty simple.

### The `new` function

With the prep work out of the way, we can take a look at the constructor itself. Since `new` is a class method, we attach it via `builder.c_singleton`. Most of `new` is basic C. Declare a struct pointer, allocate some memory, set the member variables... That's goals #1 and #3 out of the way.

Goals #2 and #4 are accomplished with `Data_Wrap_Struct`. This function translates our C struct instance into a Ruby object instance. The first argument, `self`, specifies the class in which to wrap our struct. (Since `new` is a class method, `self` is the `NativeRectangle` class.) We don't care about the second argument; it expects a function pointer, so we pass it a null pointer. The third argument is our garbage collection function. The last argument points to our struct instance.

## Attaching a C function to a Ruby object: Final attempt

Our Ruby object is now nothing more than a wrapper around a C struct. With that, we can perform a final refactoring of `area2`.

    builder.c <<-EOC
      int area2() {
        Rectangle *rect;
        Data_Get_Struct(self, Rectangle, rect);
        return rect->length * rect->width;
      }
    EOC

`Data_Get_Struct` performs the inverse operation of `Data_Wrap_Struct`. We provide `Data_Get_Struct` with a Ruby object (i.e. `self`), a struct pointer (i.e. `rect`), and the struct's datatype (i.e. `Rectangle`). Now there's no messing around with `VALUE` or `rb_funcall`... just a gooey pocket of C snug inside a crunchy Ruby shell.

## Getters and setters

We have one more task before `NativeRectangle` is complete. Now that `length` and `width` are stored in C datatypes, our `attr_reader` line is broken. Fortunately, writing getters and setters in Inline is almost as easy as writing them in Ruby!

    builder.struct_name = 'NativeRectangle'
    builder.reader :length, 'int'
    builder.reader :width, 'int'

The methods `builder.reader`, `builder.writer`, and `builder.accessor` behave exactly the same as `attr_reader`, `attr_writer`, and `attr_accessor` (except they access the members of a struct). We must specify the name of the struct by setting `builder.struct_name`. We also need to specify the datatype of the member variables.

## More resources

This "quick and dirty" guide turned out to be a lot more dirty and a lot less quick than I originally anticipated. Still, I only scratched the surface of the Ruby C API. If you want to deepen your knowledge, check out the resources below.

* [The rdocs for Ruby Inline](http://docs.seattlerb.org/RubyInline/Inline/C.html) -- For even more Inline fun.

* ['Extending Ruby' from the Pickaxe Book](http://www.ruby-doc.org/docs/ProgrammingRuby/html/ext_ruby.html) -- A nice thorough guide to writing C extensions. Some of the process described is streamlined by Inline, but it's always good to know what's going on under the hood.

* [ruby.h](http://www.opensource.apple.com/source/ruby/ruby-14/ruby/ruby.h) -- Wondering where `rb_funcall`, `VALUE`, and `Data_Wrap_Struct` came from? It's all in here, baby. This header houses the Ruby C API and is automatically included every time you call `inline do |builder|`. You may need to take a peek at this if you can't find what your looking for in the overview provided by the Pickaxe Book.