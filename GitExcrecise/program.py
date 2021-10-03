def main():
    sum = 1
    for num in range(1, 11):
        if (num % 2 == 1):
            sum = sum * num
    print (sum)

if (__name__ == "__main__"):
    main()
